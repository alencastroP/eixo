import type { Request } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import {
  AdapterPayloadError,
  type CredentialCheck,
  type LeadSourceAdapter,
  type NormalizedLead,
  type OutboundReplyInput,
  type OutboundResult,
  type PlatformCredentials,
  type VerifyResult,
} from '../core/types';
import { normalizePhone, safeEqual } from '../core/verify';

/**
 * Adapter OLX (exemplo funcional).
 *
 * A integração real depende de parceria comercial com a OLX; o shape abaixo
 * segue o formato de lead do OLX Autos/Lead Manager. Autenticação: token
 * compartilhado no header `x-olx-token` (env OLX_WEBHOOK_TOKEN).
 *
 * Payload de exemplo: backend/samples/olx-lead.json
 */
const olxPayloadSchema = z
  .object({
    leadId: z.union([z.string(), z.number()]).transform(String).optional(),
    name: z.string().min(1),
    email: z.string().email().nullish(),
    phone: z.union([z.string(), z.number()]).transform(String).nullish(),
    message: z.string().nullish(),
    ad: z
      .object({
        listId: z.union([z.string(), z.number()]).transform(String).optional(),
        subject: z.string().optional(),
        price: z.number().optional(),
        url: z.string().optional(),
      })
      .passthrough()
      .nullish(),
    utmCampaign: z.string().nullish(),
    createdAt: z.string().optional(),
  })
  .passthrough();

/**
 * Validação mockada das credenciais da OLX.
 *
 * Na integração oficial, aqui bateríamos num endpoint autenticado da OLX (ex.:
 * GET /oauth/token ou /users/me) para confirmar a chave e obter a loja. Como as
 * credenciais reais dependem de parceria comercial, o mock aceita uma apiKey que
 * comece com "olx_" e tenha ao menos 12 caracteres, devolvendo um rótulo de conta.
 */
async function validateOlxCredentials(credentials: PlatformCredentials): Promise<CredentialCheck> {
  const apiKey = (credentials.apiKey ?? '').trim();
  const clientId = (credentials.clientId ?? '').trim();
  await new Promise((r) => setTimeout(r, 200)); // simula latência de rede
  if (!apiKey || !clientId) {
    return { ok: false, error: 'Informe o Client ID e a Chave de Acesso (API Key).' };
  }
  if (!apiKey.startsWith('olx_') || apiKey.length < 12) {
    return { ok: false, error: 'Chave de Acesso inválida. O formato esperado é "olx_..." (mín. 12 caracteres).' };
  }
  return { ok: true, accountLabel: `Loja OLX · ${clientId}` };
}

/**
 * Envio mockado de resposta de volta ao cliente na OLX (fluxo OUTBOUND).
 * Na integração real, faria POST na API de mensagens da OLX usando as credenciais.
 * Nunca loga o corpo da mensagem (pode conter PII) — apenas metadados.
 */
async function sendOlxReply(input: OutboundReplyInput): Promise<OutboundResult> {
  await new Promise((r) => setTimeout(r, 150));
  if (!input.credentials.apiKey) {
    return { ok: false, error: 'Credenciais ausentes para envio.' };
  }
  const externalRef = `olx-msg-${Date.now().toString(36)}`;
  logger.info('outbound OLX: resposta replicada ao cliente', {
    externalLeadId: input.externalLeadId,
    chars: input.body.length,
    externalRef,
  });
  return { ok: true, externalRef };
}

export const olxAdapter: LeadSourceAdapter = {
  platform: 'olx',
  displayName: 'OLX',
  description: 'Capture leads e mensagens dos seus anúncios na OLX e responda sem sair do CRM.',
  docsUrl: 'https://developers.olx.com.br/',
  supportsOutbound: true,
  credentialFields: [
    {
      key: 'clientId',
      label: 'Client ID',
      type: 'text',
      placeholder: 'ex.: minha-loja-veiculos',
      help: 'Identificador da sua conta de integração na OLX.',
      required: true,
    },
    {
      key: 'apiKey',
      label: 'Chave de Acesso (API Key)',
      type: 'password',
      placeholder: 'olx_xxxxxxxxxxxx',
      help: 'Gerada no painel de desenvolvedor da OLX. Fica cifrada em repouso.',
      required: true,
    },
  ],

  validateCredentials: validateOlxCredentials,
  sendReply: sendOlxReply,

  verifyRequest(req: Request): VerifyResult {
    const secret = env.integrations.olxWebhookToken;
    if (!secret) return { ok: false, configured: false, reason: 'OLX_WEBHOOK_TOKEN não configurado' };
    const token = req.header('x-olx-token');
    if (token && safeEqual(token, secret)) return { ok: true };
    return { ok: false, configured: true, reason: 'header x-olx-token ausente ou inválido' };
  },

  normalize(payload: unknown): NormalizedLead {
    const parsed = olxPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new AdapterPayloadError('olx', 'payload de lead inesperado', parsed.error.issues);
    }
    const data = parsed.data;
    return {
      externalLeadId: data.leadId,
      name: data.name,
      phone: normalizePhone(data.phone),
      email: data.email?.toLowerCase() ?? undefined,
      message: data.message?.trim() || 'Interessado no anúncio (sem mensagem).',
      vehicle: data.ad
        ? {
            externalId: data.ad.listId,
            title: data.ad.subject,
            price: data.ad.price,
            url: data.ad.url,
          }
        : undefined,
      campaign: data.utmCampaign ?? undefined,
      platformReceivedAt: data.createdAt,
    };
  },
};
