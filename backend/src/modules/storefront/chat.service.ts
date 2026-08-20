import { createHmac, timingSafeEqual } from 'node:crypto';
import { InteractionType } from '@prisma/client';
import { aiEnabled, env } from '../../config/env';
import { badRequest, forbidden } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { normalizePhone } from '../../integrations/core/verify';
import { handleInboundMessage } from '../aiAgent/agent.service';
import { ingestNormalizedLead } from '../tickets/ingest.service';
import { getPublicVehicle, resolveAccountId } from './storefront.service';

/**
 * Chat do visitante com o Agente de Pré-Venda IA, a partir da vitrine.
 *
 * A conversa é um ticket comum: a primeira mensagem passa por
 * `ingestNormalizedLead` (mesma porta dos leads de OLX/ML) e o bot é ligado
 * naquele ticket. Cada mensagem seguinte é gravada como CUSTOMER_MESSAGE e
 * processada por `handleInboundMessage`, exatamente como uma mensagem vinda de
 * plataforma — então o histórico, o transbordo para humano e a auditoria são os
 * mesmos do atendimento normal. O atendente vê tudo na Caixa de Entrada e pode
 * assumir a qualquer momento.
 *
 * O visitante é anônimo, então a continuidade da conversa não pode depender de
 * enviar um id de ticket (seria adivinhável). O cliente recebe um TOKEN
 * assinado (HMAC) que só o servidor consegue emitir.
 */

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // conversa expira em 12h

function sign(payload: string): string {
  return createHmac('sha256', env.security.credentialsSecret).update(payload).digest('base64url');
}

/** token = <ticketId>.<emitidoEm>.<assinatura> */
function issueToken(ticketId: string): string {
  const payload = `${ticketId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

function readToken(token: string): string {
  const parts = token.split('.');
  if (parts.length !== 3) throw forbidden('Conversa inválida', 'CHAT_TOKEN_INVALID');
  const [ticketId, issuedAt, signature] = parts;

  const expected = Buffer.from(sign(`${ticketId}.${issuedAt}`));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw forbidden('Conversa inválida', 'CHAT_TOKEN_INVALID');
  }
  if (Date.now() - Number(issuedAt) > TOKEN_TTL_MS) {
    throw forbidden('Conversa expirada. Inicie um novo atendimento.', 'CHAT_TOKEN_EXPIRED');
  }
  return ticketId;
}

export interface ChatInput {
  token?: string;
  name?: string;
  phone?: string;
  message: string;
  vehicleId?: string;
}

export interface ChatResult {
  token: string;
  /** Resposta da IA, ou null quando ninguém respondeu automaticamente. */
  reply: string | null;
  /** false = agente indisponível (sem ANTHROPIC_API_KEY) — o lead foi registrado mesmo assim. */
  aiEnabled: boolean;
  /** true = a conversa saiu do bot e está com a equipe (transbordo ou atendente assumiu). */
  handedOff: boolean;
}

async function lastReplyId(ticketId: string): Promise<string | null> {
  const row = await prisma.ticketInteraction.findFirst({
    where: { ticketId, type: InteractionType.AGENT_REPLY },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function sendChatMessage(slug: string, input: ChatInput): Promise<ChatResult> {
  // valida a vitrine antes de qualquer escrita (despublicada não abre conversa)
  await resolveAccountId(slug);

  const message = input.message.trim();
  if (!message) throw badRequest('Escreva uma mensagem');

  let ticketId: string;

  if (input.token) {
    ticketId = readToken(input.token);
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true } });
    if (!ticket) throw forbidden('Conversa inválida', 'CHAT_TOKEN_INVALID');

    await prisma.ticketInteraction.create({
      data: { ticketId, type: InteractionType.CUSTOMER_MESSAGE, body: message },
    });
    await prisma.ticket.update({ where: { id: ticketId }, data: { lastCustomerMessageAt: new Date() } });
  } else {
    const phone = normalizePhone(input.phone);
    if (!input.name?.trim() || !phone) throw badRequest('Informe seu nome e WhatsApp para começar');

    // veículo em pauta: só o que é público (não serve para sondar estoque oculto)
    let vehicle: { externalId: string; title: string; price?: number } | undefined;
    if (input.vehicleId) {
      const v = await getPublicVehicle(slug, input.vehicleId);
      vehicle = {
        externalId: v.id,
        title: [v.brand, v.model, v.version].filter(Boolean).join(' '),
        price: v.price ?? undefined,
      };
    }

    const ingested = await ingestNormalizedLead('site', {
      name: input.name.trim(),
      phone,
      message,
      vehicle,
      campaign: `site:${slug}:chat`,
    });
    ticketId = ingested.ticketId;
    await prisma.ticket.update({ where: { id: ticketId }, data: { botEnabled: true } });
  }

  const previousReply = await lastReplyId(ticketId);
  await handleInboundMessage(ticketId); // nunca lança: falha da IA vira log

  const [reply, ticket] = await Promise.all([
    prisma.ticketInteraction.findFirst({
      where: { ticketId, type: InteractionType.AGENT_REPLY },
      orderBy: { createdAt: 'desc' },
      select: { id: true, body: true },
    }),
    prisma.ticket.findUnique({ where: { id: ticketId }, select: { botEnabled: true } }),
  ]);

  const answered = reply && reply.id !== previousReply ? reply.body : null;
  return {
    token: issueToken(ticketId),
    reply: answered,
    aiEnabled: aiEnabled(),
    handedOff: !ticket?.botEnabled,
  };
}
