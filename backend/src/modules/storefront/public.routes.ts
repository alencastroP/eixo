import { Router } from 'express';
import { z } from 'zod';
import { VehicleType } from '@prisma/client';
import { ah } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { siteChatPollRateLimit, siteChatRateLimit, siteLeadRateLimit } from '../../middleware/security';
import { normalizePhone } from '../../integrations/core/verify';
import { handleInboundMessage } from '../aiAgent/agent.service';
import { ingestNormalizedLead } from '../tickets/ingest.service';
import * as storefront from './storefront.service';
import { fetchChatMessages, sendChatMessage } from './chat.service';

/**
 * Rotas ABERTAS da vitrine - servem visitantes anônimos do site da loja.
 *
 * Nada aqui passa por `authenticate`/`requireActiveAccount`: a conta é resolvida
 * pelo `:slug` da vitrine publicada. Consequências que o código honra:
 *  - só sai estoque marcado para exibição e à venda (regras em storefront.service);
 *  - os serializadores públicos omitem custo, margem, placa, chassi e renavam;
 *  - o envio de lead tem rate limit próprio e honeypot (bots de formulário).
 */
export const publicSiteRouter = Router();

publicSiteRouter.get(
  '/:slug',
  ah(async (req, res) => {
    res.json(await storefront.getPublicSite(req.params.slug));
  }),
);

const listSchema = z.object({
  search: z.string().trim().min(1).optional(),
  brand: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  year: z.coerce.number().int().optional(),
  type: z.nativeEnum(VehicleType).optional(),
  priceMin: z.coerce.number().min(0).optional(),
  priceMax: z.coerce.number().min(0).optional(),
  tag: z.enum(['automatico', 'manual', '4x4']).optional(),
  sort: z.enum(['recent', 'priceAsc', 'priceDesc', 'kmAsc', 'yearDesc']).default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});

publicSiteRouter.get(
  '/:slug/vehicles',
  ah(async (req, res) => {
    res.json(await storefront.listPublicVehicles(req.params.slug, listSchema.parse(req.query)));
  }),
);

publicSiteRouter.get(
  '/:slug/vehicles/:id',
  ah(async (req, res) => {
    res.json(await storefront.getPublicVehicle(req.params.slug, req.params.id));
  }),
);

/**
 * Formulário do site → lead no CRM.
 *
 * `origin` diz de qual bloco veio (interesse em veículo, financiamento, venda do
 * usado, contato) e vira o assunto da mensagem. `website` é o honeypot: campo
 * escondido no HTML que só um bot preenche - respondemos 202 sem criar nada,
 * para o bot não descobrir que foi barrado.
 */
const leadSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome'),
  phone: z.string().trim().min(8, 'Informe um telefone com DDD'),
  email: z.string().trim().email('E-mail inválido').optional().or(z.literal('')),
  message: z.string().trim().max(1000).optional(),
  vehicleId: z.string().trim().optional(),
  origin: z.enum(['vehicle', 'financing', 'sell', 'contact']).default('contact'),
  // honeypot: aceito na validação de propósito - a rejeição acontece no handler,
  // com 202, para o bot não aprender que o campo o denunciou.
  website: z.string().max(200).optional(),
});

const ORIGIN_LABEL: Record<'vehicle' | 'financing' | 'sell' | 'contact', string> = {
  vehicle: 'Interesse em veículo do site',
  financing: 'Simulação de financiamento pelo site',
  sell: 'Quer vender/trocar o veículo (site)',
  contact: 'Contato pelo site',
};

publicSiteRouter.post(
  '/:slug/leads',
  siteLeadRateLimit,
  ah(async (req, res) => {
    const input = leadSchema.parse(req.body);
    if (input.website) return res.status(202).json({ ok: true }); // honeypot

    const slug = req.params.slug;
    // resolve antes de qualquer escrita: vitrine despublicada não gera lead.
    // O slug é o que define a conta dona deste lead - visitante anônimo nunca
    // informa tenant, ele é derivado do site em que a pessoa está navegando.
    const accountId = await storefront.resolveAccountId(slug);

    // veículo referenciado: só o que é público (evita sondar o estoque oculto)
    let vehicle: { externalId: string; title: string; price?: number } | undefined;
    if (input.vehicleId) {
      const v = await storefront.getPublicVehicle(slug, input.vehicleId);
      vehicle = {
        externalId: v.id,
        title: [v.brand, v.model, v.version].filter(Boolean).join(' '),
        price: v.price ?? undefined,
      };
    }

    const parts = [ORIGIN_LABEL[input.origin]];
    if (vehicle) parts.push(`Veículo: ${vehicle.title}`);
    if (input.message) parts.push(input.message);

    const result = await ingestNormalizedLead(accountId, 'site', {
      name: input.name,
      phone: normalizePhone(input.phone),
      email: input.email || undefined,
      message: parts.join('\n\n'),
      vehicle,
      campaign: `site:${slug}`,
    });

    // Mensagem enviada de dentro do anúncio de um veículo: liga a IA no mesmo
    // ticket, igual ao chat do site - o visitante que manda "quero mais
    // informações" já recebe uma resposta automática, sem esperar um atendente
    // humano abrir a conversa. Só na criação: se o ticket já existia (dedup) e um
    // humano assumiu, `botEnabled` já está false e não é reativado aqui.
    if (input.origin === 'vehicle') {
      if (result.created) {
        await prisma.ticket.update({ where: { id: result.ticketId }, data: { botEnabled: true } });
      }
      await handleInboundMessage(result.ticketId); // nunca lança: falha da IA vira log
    }

    return res.status(201).json({ ok: true, created: result.created });
  }),
);

/**
 * Chat com o Agente de Pré-Venda IA. A primeira mensagem exige nome e WhatsApp
 * (é o que cria o lead); as seguintes usam o token devolvido aqui.
 */
const chatSchema = z.object({
  token: z.string().trim().max(200).optional(),
  after: z.string().trim().max(60).optional(),
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(40).optional(),
  message: z.string().trim().min(1, 'Escreva uma mensagem').max(1000),
  vehicleId: z.string().trim().optional(),
});

publicSiteRouter.post(
  '/:slug/chat',
  siteChatRateLimit,
  ah(async (req, res) => {
    res.json(await sendChatMessage(req.params.slug, chatSchema.parse(req.body)));
  }),
);

/**
 * Canal de VOLTA da conversa: o widget pergunta o que a loja respondeu desde o
 * cursor. É por aqui que a resposta do atendente humano chega ao site - depois
 * do transbordo a IA está desligada, então o POST acima não tem o que devolver.
 *
 * Limite próprio (por minuto): esta rota é uma leitura indexada e é chamada em
 * intervalo curto, ao contrário do envio, que custa uma chamada ao modelo.
 */
const chatPollSchema = z.object({
  token: z.string().trim().min(1).max(200),
  after: z.string().trim().max(60).optional(),
});

publicSiteRouter.get(
  '/:slug/chat/messages',
  siteChatPollRateLimit,
  ah(async (req, res) => {
    const { token, after } = chatPollSchema.parse(req.query);
    res.json(await fetchChatMessages(req.params.slug, token, after));
  }),
);
