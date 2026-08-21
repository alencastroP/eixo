import { createHmac, timingSafeEqual } from 'node:crypto';
import { InteractionType, Prisma, TicketStatus } from '@prisma/client';
import { aiEnabled, env } from '../../config/env';
import { badRequest, forbidden } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { normalizePhone } from '../../integrations/core/verify';
import { handleInboundMessage } from '../aiAgent/agent.service';
import { writeAudit } from '../audit/audit.service';
import { rescheduleTicket } from '../flow/flow.service';
import { ingestNormalizedLead } from '../tickets/ingest.service';
import { CLOSED_STATUSES } from '../tickets/tickets.service';
import { getPublicVehicle, resolveAccountId } from './storefront.service';

/**
 * Chat do visitante com o Agente de Pré-Venda IA, a partir da vitrine.
 *
 * A conversa é um ticket comum: a primeira mensagem passa por
 * `ingestNormalizedLead` (mesma porta dos leads de OLX/ML) e o bot é ligado
 * naquele ticket. Cada mensagem seguinte é gravada como CUSTOMER_MESSAGE e
 * processada por `handleInboundMessage`, exatamente como uma mensagem vinda de
 * plataforma - então o histórico, o transbordo para humano e a auditoria são os
 * mesmos do atendimento normal. O atendente vê tudo na Caixa de Entrada e pode
 * assumir a qualquer momento.
 *
 * O visitante é anônimo, então a continuidade da conversa não pode depender de
 * enviar um id de ticket (seria adivinhável). O cliente recebe um TOKEN
 * assinado (HMAC) que só o servidor consegue emitir.
 *
 * ENTREGA DAS RESPOSTAS. A vitrine não é uma plataforma externa: não existe
 * adapter de outbound para onde despachar a resposta do atendente (ver
 * integrations/outbound.ts), então o canal de volta é o próprio widget puxando
 * as novas interações - `fetchChatMessages`. Sem isso, tudo que o atendente
 * escrevesse pela Caixa de Entrada depois do transbordo morreria no banco: o
 * envio só devolvia o que a IA acabara de responder, e a IA está desligada
 * justamente quando um humano assume.
 */

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // conversa expira em 12h

const toJson = (value: unknown) => value as Prisma.InputJsonValue;

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
  /** Id da última interação que o visitante já viu (ver ChatResult.cursor). */
  after?: string;
  name?: string;
  phone?: string;
  message: string;
  vehicleId?: string;
}

/** Uma bolha da conversa, do ponto de vista do visitante. */
export interface ChatMessage {
  id: string;
  /** quem falou: o próprio visitante, o agente de IA ou uma pessoa da loja */
  from: 'customer' | 'bot' | 'agent';
  /** primeiro nome do atendente humano (null para visitante e IA) */
  author: string | null;
  text: string;
  at: string;
}

export interface ChatResult {
  token: string;
  /**
   * Marca d'água da conversa: id da última interação existente no momento da
   * resposta. O visitante devolve isto no próximo envio/consulta e recebe só o
   * que veio depois - é o que impede a mesma resposta de aparecer duas vezes.
   */
  cursor: string | null;
  /** Respostas novas (IA ou atendente) desde o cursor informado. */
  messages: ChatMessage[];
  /** false = agente indisponível (sem ANTHROPIC_API_KEY) - o lead foi registrado mesmo assim. */
  aiEnabled: boolean;
  /** true = a conversa saiu do bot e está com a equipe (transbordo ou atendente assumiu). */
  handedOff: boolean;
}

export interface ChatTranscript {
  cursor: string | null;
  messages: ChatMessage[];
  /** true = `messages` é o histórico inteiro (o widget substitui, não anexa). */
  history: boolean;
  handedOff: boolean;
}

/** Últimas mensagens devolvidas quando o widget recarrega sem cursor. */
const HISTORY_LIMIT = 50;

/** Nota interna e eventos de sistema nunca saem daqui - o cliente veria. */
const VISIBLE_TO_CUSTOMER = [InteractionType.CUSTOMER_MESSAGE, InteractionType.AGENT_REPLY];

type InteractionRow = {
  id: string;
  type: InteractionType;
  body: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  author: { name: string } | null;
};

const rowSelect = {
  id: true,
  type: true,
  body: true,
  metadata: true,
  createdAt: true,
  author: { select: { name: true } },
} as const;

function toChatMessage(row: InteractionRow): ChatMessage {
  const ai = (row.metadata as { ai?: unknown } | null)?.ai === true;
  const human = row.type === InteractionType.AGENT_REPLY && !ai;
  return {
    id: row.id,
    from: row.type === InteractionType.CUSTOMER_MESSAGE ? 'customer' : ai ? 'bot' : 'agent',
    // só o primeiro nome: quem atende se apresenta, mas o sobrenome do
    // funcionário não precisa circular no site.
    author: human ? (row.author?.name.split(' ')[0] ?? null) : null,
    text: row.body ?? '',
    at: row.createdAt.toISOString(),
  };
}

/** Id da interação mais recente do ticket - a marca d'água devolvida ao widget. */
async function currentCursor(ticketId: string): Promise<string | null> {
  const row = await prisma.ticketInteraction.findFirst({
    where: { ticketId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * Interações posteriores ao cursor. O desempate por `id` existe porque duas
 * interações podem nascer no mesmo milissegundo (resposta + mudança de status na
 * mesma transação) - comparar só `createdAt` perderia ou repetiria uma delas.
 */
async function messagesAfter(ticketId: string, afterId: string, types: InteractionType[]): Promise<ChatMessage[]> {
  const cursor = await prisma.ticketInteraction.findFirst({
    where: { id: afterId, ticketId },
    select: { id: true, createdAt: true },
  });
  // Cursor que não pertence a este ticket: não dá para saber o que é "novo" sem
  // reenviar a conversa inteira e duplicar tudo na tela. Melhor nada - o cursor
  // devolvido junto ressincroniza o widget.
  if (!cursor) return [];

  const rows = await prisma.ticketInteraction.findMany({
    where: {
      ticketId,
      type: { in: types },
      body: { not: null },
      OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: rowSelect,
  });
  return rows.map(toChatMessage);
}

/** Conversa inteira (últimas HISTORY_LIMIT), para remontar o widget após um reload. */
async function fullHistory(ticketId: string): Promise<ChatMessage[]> {
  const rows = await prisma.ticketInteraction.findMany({
    where: { ticketId, type: { in: VISIBLE_TO_CUSTOMER }, body: { not: null } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: HISTORY_LIMIT,
    select: rowSelect,
  });
  return rows.reverse().map(toChatMessage);
}

/**
 * Valida o token contra a vitrine e devolve o ticket. A assinatura HMAC prova
 * que o token foi emitido por nós, mas não diz por QUAL loja: sem conferir a
 * conta, um token obtido no site de uma loja seguiria valendo no site de outra,
 * lendo e injetando mensagens no funil alheio.
 */
async function resolveConversation(accountId: string, token: string) {
  const ticketId = readToken(token);
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, accountId: true, status: true, botEnabled: true },
  });
  if (!ticket || ticket.accountId !== accountId) throw forbidden('Conversa inválida', 'CHAT_TOKEN_INVALID');
  return ticket;
}

/**
 * Registra a mensagem do visitante com a MESMA contabilidade de um lead de
 * plataforma (ver ingest.service): o relógio de follow-up zera e a conversa
 * volta para a fila humana. Sem reabrir, uma conversa em espera - ou já
 * encerrada, com o token ainda válido - engoliria a mensagem sem que ninguém a
 * visse na Caixa de Entrada.
 */
async function recordCustomerMessage(
  ticket: { id: string; status: TicketStatus },
  message: string,
): Promise<void> {
  const reopen =
    ticket.status === TicketStatus.WAITING_CUSTOMER || CLOSED_STATUSES.includes(ticket.status);

  await prisma.$transaction(async (tx) => {
    await tx.ticketInteraction.create({
      data: { ticketId: ticket.id, type: InteractionType.CUSTOMER_MESSAGE, body: message },
    });

    const data: Prisma.TicketUncheckedUpdateInput = { lastCustomerMessageAt: new Date(), followUpCount: 0 };
    if (reopen) {
      data.status = TicketStatus.IN_PROGRESS;
      data.closedAt = null;
      await tx.ticketInteraction.create({
        data: {
          ticketId: ticket.id,
          type: InteractionType.STATUS_CHANGE,
          metadata: toJson({ kind: 'status', from: ticket.status, to: TicketStatus.IN_PROGRESS, auto: true }),
        },
      });
      await writeAudit(tx, {
        entityType: 'TICKET',
        entityId: ticket.id,
        action: 'STATUS_CHANGED',
        data: { from: ticket.status, to: TicketStatus.IN_PROGRESS, via: 'site_chat' },
      });
    }

    await tx.ticket.update({ where: { id: ticket.id }, data });
  });

  // fora da transação, como na ingestão: ler a política da conta não precisa
  // prolongar o lock da escrita
  await rescheduleTicket(ticket.id);
}

/**
 * Canal de volta do widget: o que a loja respondeu desde o cursor.
 *
 * Sem `after` devolve o histórico visível - é como a conversa sobrevive a um
 * reload da página, já que o token fica no sessionStorage mas as bolhas não.
 *
 * O cursor é lido ANTES das mensagens de propósito. Se uma resposta nascer entre
 * as duas consultas, ela vem na leva atual e ainda virá na próxima - o widget
 * descarta id repetido. Na ordem inversa a mesma corrida perderia a resposta
 * para sempre, que é exatamente o defeito que este canal existe para não ter.
 */
export async function fetchChatMessages(slug: string, token: string, after?: string): Promise<ChatTranscript> {
  const accountId = await resolveAccountId(slug);
  const ticket = await resolveConversation(accountId, token);

  const cursor = await currentCursor(ticket.id);
  const messages = after
    ? await messagesAfter(ticket.id, after, [InteractionType.AGENT_REPLY])
    : await fullHistory(ticket.id);

  return { cursor, messages, history: !after, handedOff: !ticket.botEnabled };
}

export async function sendChatMessage(slug: string, input: ChatInput): Promise<ChatResult> {
  // valida a vitrine antes de qualquer escrita (despublicada não abre conversa)
  const accountId = await resolveAccountId(slug);

  const message = input.message.trim();
  if (!message) throw badRequest('Escreva uma mensagem');

  let ticketId: string;
  // Só faz sentido filtrar por cursor em conversa que já existia: na primeira
  // mensagem não há nada anterior que o visitante possa ter visto.
  let after = input.token ? input.after : undefined;

  if (input.token) {
    const ticket = await resolveConversation(accountId, input.token);
    ticketId = ticket.id;
    await recordCustomerMessage(ticket, message);
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

    const ingested = await ingestNormalizedLead(accountId, 'site', {
      name: input.name.trim(),
      phone,
      message,
      vehicle,
      campaign: `site:${slug}:chat`,
    });
    ticketId = ingested.ticketId;
    await prisma.ticket.update({ where: { id: ticketId }, data: { botEnabled: true } });
  }

  // Sem cursor do cliente, a régua é a própria mensagem recém-gravada: devolver
  // o histórico aqui exporia conversas anteriores a quem só conhece nome e
  // telefone, já que a ingestão anexa a um ticket aberto do mesmo lead.
  if (!after) {
    const mine = await prisma.ticketInteraction.findFirst({
      where: { ticketId, type: InteractionType.CUSTOMER_MESSAGE },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    after = mine?.id;
  }

  await handleInboundMessage(ticketId); // nunca lança: falha da IA vira log

  const cursor = await currentCursor(ticketId);
  const [messages, ticket] = await Promise.all([
    after ? messagesAfter(ticketId, after, [InteractionType.AGENT_REPLY]) : Promise.resolve([]),
    prisma.ticket.findUnique({ where: { id: ticketId }, select: { botEnabled: true } }),
  ]);

  return {
    token: issueToken(ticketId),
    cursor,
    messages,
    aiEnabled: aiEnabled(),
    handedOff: !ticket?.botEnabled,
  };
}
