import { InteractionType, Prisma, TicketPriority, TicketStatus } from '@prisma/client';
import { env } from '../../config/env';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { normalizePhone } from '../../integrations/core/verify';
import type { NormalizedLead } from '../../integrations/core/types';
import { dispatchOutboundReply } from '../../integrations/outbound';
import { handleInboundMessage } from '../aiAgent/agent.service';
import { writeAudit } from '../audit/audit.service';

export interface CurrentUser {
  id: string;
  role: 'ADMIN' | 'AGENT';
  name: string;
  email: string;
}

export const CLOSED_STATUSES: TicketStatus[] = [
  TicketStatus.CONVERTED,
  TicketStatus.LOST,
  TicketStatus.ARCHIVED,
];

// última mensagem com corpo — preview no estilo "inbox" da lista de tickets
const listInclude = {
  lead: true,
  assignedTo: { select: { id: true, name: true } },
  interactions: {
    where: {
      body: { not: null },
      type: {
        in: [InteractionType.CUSTOMER_MESSAGE, InteractionType.AGENT_REPLY, InteractionType.INTERNAL_NOTE],
      },
    },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { body: true, type: true, createdAt: true },
  },
} satisfies Prisma.TicketInclude;

const detailInclude = {
  lead: true,
  assignedTo: { select: { id: true, name: true } },
  interactions: {
    orderBy: { createdAt: 'asc' as const },
    include: { author: { select: { id: true, name: true } } },
  },
} satisfies Prisma.TicketInclude;

type TicketBase = Prisma.TicketGetPayload<{
  include: { lead: true; assignedTo: { select: { id: true; name: true } } };
}>;
type TicketRow = Prisma.TicketGetPayload<{ include: typeof listInclude }>;
type TicketDetailRow = Prisma.TicketGetPayload<{ include: typeof detailInclude }>;

const toJson = (value: unknown) => value as Prisma.InputJsonValue;

// ─── Serialização ────────────────────────────────────────────────────────────

/**
 * SLA de primeira resposta (campo calculado, sem automação de alerta no MVP):
 * mede da criação até a primeira resposta do atendente; enquanto não houver
 * resposta (nem fechamento), o relógio continua correndo.
 */
function computeSla(t: TicketBase) {
  const reference = t.firstResponseAt ?? t.closedAt ?? new Date();
  const seconds = Math.max(0, Math.floor((reference.getTime() - t.createdAt.getTime()) / 1000));
  return {
    firstResponseSeconds: seconds,
    pending: !t.firstResponseAt && !t.closedAt,
    breached: seconds > env.rules.slaFirstResponseMinutes * 60,
    limitMinutes: env.rules.slaFirstResponseMinutes,
  };
}

export function serializeTicket(t: TicketBase) {
  return {
    id: t.id,
    number: t.number,
    status: t.status,
    priority: t.priority,
    platform: t.platform,
    campaign: t.campaign,
    botEnabled: t.botEnabled,
    vehicle: (t.vehicleRefExternal as Record<string, unknown> | null) ?? null,
    lead: {
      id: t.lead.id,
      name: t.lead.name,
      phone: t.lead.phone,
      email: t.lead.email,
      document: t.lead.document,
      anonymizedAt: t.lead.anonymizedAt,
    },
    assignedTo: t.assignedTo,
    sla: computeSla(t),
    firstResponseAt: t.firstResponseAt,
    lastCustomerMessageAt: t.lastCustomerMessageAt,
    closedAt: t.closedAt,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export function serializeTicketDetail(t: TicketDetailRow) {
  return {
    ...serializeTicket(t),
    interactions: t.interactions.map((i) => ({
      id: i.id,
      type: i.type,
      body: i.body,
      metadata: i.metadata as Record<string, unknown> | null,
      author: i.author,
      createdAt: i.createdAt,
    })),
  };
}

// ─── Escopo por papel ────────────────────────────────────────────────────────

/** Atendente enxerga apenas tickets próprios ou não atribuídos; admin vê tudo. */
function scopeFor(user: CurrentUser): Prisma.TicketWhereInput {
  if (user.role === 'ADMIN') return {};
  return { OR: [{ assignedToId: user.id }, { assignedToId: null }] };
}

async function getScopedTicket(id: string, user: CurrentUser): Promise<TicketDetailRow> {
  const ticket = await prisma.ticket.findUnique({ where: { id }, include: detailInclude });
  if (!ticket) throw notFound('Ticket não encontrado');
  if (user.role !== 'ADMIN' && ticket.assignedToId && ticket.assignedToId !== user.id) {
    throw forbidden('Este ticket está atribuído a outro atendente');
  }
  return ticket;
}

// ─── Listagem ────────────────────────────────────────────────────────────────

export interface ListTicketsParams {
  status?: TicketStatus;
  platform?: string;
  assignedTo?: string; // 'me' | 'unassigned' | userId
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
}

export async function listTickets(params: ListTicketsParams, user: CurrentUser) {
  const and: Prisma.TicketWhereInput[] = [scopeFor(user)];

  if (params.status) and.push({ status: params.status });
  if (params.platform) and.push({ platform: params.platform });

  if (params.assignedTo === 'me') and.push({ assignedToId: user.id });
  else if (params.assignedTo === 'unassigned') and.push({ assignedToId: null });
  else if (params.assignedTo) and.push({ assignedToId: params.assignedTo });

  if (params.dateFrom) and.push({ createdAt: { gte: new Date(`${params.dateFrom}T00:00:00`) } });
  if (params.dateTo) and.push({ createdAt: { lte: new Date(`${params.dateTo}T23:59:59.999`) } });

  if (params.search?.trim()) {
    const s = params.search.trim();
    const or: Prisma.TicketWhereInput[] = [
      { lead: { name: { contains: s, mode: 'insensitive' } } },
      { lead: { email: { contains: s, mode: 'insensitive' } } },
    ];
    const digits = s.replace(/\D/g, '');
    if (digits.length >= 4) or.push({ lead: { phone: { contains: digits } } });
    const asNumber = Number(s.replace(/^#/, ''));
    // limite de int4: buscas com telefone (11 dígitos) não devem virar filtro de nº
    if (Number.isInteger(asNumber) && asNumber > 0 && asNumber <= 2_147_483_647) {
      or.push({ number: asNumber });
    }
    and.push({ OR: or });
  }

  const where: Prisma.TicketWhereInput = { AND: and };
  const [total, rows] = await prisma.$transaction([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      include: listInclude,
      orderBy: { updatedAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
  ]);

  const items = rows.map((row: TicketRow) => ({
    ...serializeTicket(row),
    lastMessage: row.interactions[0]
      ? {
          body: (row.interactions[0].body ?? '').slice(0, 140),
          type: row.interactions[0].type,
          createdAt: row.interactions[0].createdAt,
        }
      : null,
  }));

  return { items, total, page: params.page, pageSize: params.pageSize };
}

export async function ticketStats(user: CurrentUser) {
  const scope = scopeFor(user);
  const [groups, unassigned] = await Promise.all([
    prisma.ticket.groupBy({ by: ['status'], _count: true, where: scope, orderBy: { status: 'asc' } }),
    prisma.ticket.count({ where: { AND: [scope, { assignedToId: null }] } }),
  ]);
  const byStatus = Object.fromEntries(Object.values(TicketStatus).map((s) => [s, 0])) as Record<TicketStatus, number>;
  for (const g of groups) byStatus[g.status] = g._count;
  const total = groups.reduce((acc, g) => acc + g._count, 0);
  return { byStatus, total, unassigned };
}

/**
 * Métricas para o dashboard ("painel"). Respeita o escopo por papel: o atendente
 * vê os próprios números; o admin, os globais. Janela configurável em dias.
 */
export async function ticketMetrics(user: CurrentUser, windowDays = 30) {
  const scope = scopeFor(user);
  const since = new Date(Date.now() - windowDays * 24 * 3_600_000);
  const inWindow: Prisma.TicketWhereInput = { AND: [scope, { createdAt: { gte: since } }] };

  const [byStatus, byPlatform, totalAll, openNow, respondedTickets, createdInWindow] = await Promise.all([
    prisma.ticket.groupBy({ by: ['status'], _count: true, where: scope, orderBy: { status: 'asc' } }),
    prisma.ticket.groupBy({ by: ['platform'], _count: true, where: inWindow, orderBy: { platform: 'asc' } }),
    prisma.ticket.count({ where: scope }),
    prisma.ticket.count({ where: { AND: [scope, { status: { notIn: CLOSED_STATUSES } }] } }),
    // tickets já respondidos: tempo de 1ª resposta para a média
    prisma.ticket.findMany({
      where: { AND: [scope, { firstResponseAt: { not: null } }, { createdAt: { gte: since } }] },
      select: { createdAt: true, firstResponseAt: true },
    }),
    prisma.ticket.count({ where: inWindow }),
  ]);

  const statusCount = Object.fromEntries(Object.values(TicketStatus).map((s) => [s, 0])) as Record<
    TicketStatus,
    number
  >;
  for (const g of byStatus) statusCount[g.status] = g._count;

  const converted = statusCount.CONVERTED;
  const lost = statusCount.LOST;
  const decided = converted + lost; // negócios com desfecho comercial
  const conversionRate = decided > 0 ? converted / decided : 0;

  // tempo médio de primeira resposta (segundos) na janela
  const responseSeconds = respondedTickets.map(
    (t) => (t.firstResponseAt!.getTime() - t.createdAt.getTime()) / 1000,
  );
  const avgFirstResponseSeconds =
    responseSeconds.length > 0 ? Math.round(responseSeconds.reduce((a, b) => a + b, 0) / responseSeconds.length) : null;

  // SLA de 1ª resposta estourado entre os que ainda aguardam resposta
  const slaLimit = env.rules.slaFirstResponseMinutes * 60;
  const awaitingFirstResponse = await prisma.ticket.findMany({
    where: { AND: [scope, { firstResponseAt: null }, { status: { notIn: CLOSED_STATUSES } }] },
    select: { createdAt: true },
  });
  const slaBreachedNow = awaitingFirstResponse.filter(
    (t) => (Date.now() - t.createdAt.getTime()) / 1000 > slaLimit,
  ).length;

  return {
    windowDays,
    totalAll,
    openNow,
    createdInWindow,
    converted,
    lost,
    conversionRate, // 0..1
    avgFirstResponseSeconds, // null se nenhum ticket respondido
    slaLimitMinutes: env.rules.slaFirstResponseMinutes,
    slaBreachedNow,
    awaitingResponse: awaitingFirstResponse.length,
    byStatus: statusCount,
    byPlatform: byPlatform.map((p) => ({ platform: p.platform, count: p._count })),
  };
}

export async function getTicket(id: string, user: CurrentUser) {
  return serializeTicketDetail(await getScopedTicket(id, user));
}

// ─── Criação manual (lead que chegou por telefone/loja) ──────────────────────

export interface CreateManualTicketInput {
  lead: { name: string; phone?: string; email?: string; document?: string };
  message: string;
  vehicleText?: string;
  priority?: TicketPriority;
  // campos personalizados habilitados nas Configurações (config "leadForm")
  extra?: Record<string, string>;
}

export async function createManualTicket(input: CreateManualTicketInput, user: CurrentUser) {
  const ticketId = await prisma.$transaction(async (tx) => {
    const extraClean = input.extra
      ? Object.fromEntries(Object.entries(input.extra).filter(([, v]) => v?.trim()))
      : undefined;
    const lead = await tx.lead.create({
      data: {
        name: input.lead.name,
        phone: normalizePhone(input.lead.phone),
        email: input.lead.email?.toLowerCase(),
        document: input.lead.document ? input.lead.document.replace(/\D/g, '') : null,
        extra: extraClean && Object.keys(extraClean).length > 0 ? (extraClean as Prisma.InputJsonValue) : undefined,
        platform: 'manual',
      },
    });

    const ticket = await tx.ticket.create({
      data: {
        leadId: lead.id,
        platform: 'manual',
        priority: input.priority ?? TicketPriority.NORMAL,
        // quem registra o atendimento manual já assume o ticket (admin deixa em aberto)
        assignedToId: user.role === 'AGENT' ? user.id : null,
        vehicleRefExternal: input.vehicleText ? toJson({ title: input.vehicleText }) : undefined,
        lastCustomerMessageAt: new Date(),
      },
    });

    await tx.ticketInteraction.create({
      data: {
        ticketId: ticket.id,
        type: InteractionType.CUSTOMER_MESSAGE,
        body: input.message,
        metadata: toJson({ registeredById: user.id, registeredByName: user.name }),
      },
    });
    await writeAudit(tx, {
      entityType: 'TICKET',
      entityId: ticket.id,
      action: 'CREATED',
      actorId: user.id,
      data: { via: 'manual' },
    });
    return ticket.id;
  });

  return getTicket(ticketId, user);
}

// ─── Atualização (status, prioridade, atribuição) ────────────────────────────

export interface UpdateTicketInput {
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedToId?: string | null;
}

export async function updateTicket(id: string, patch: UpdateTicketInput, user: CurrentUser) {
  const ticket = await getScopedTicket(id, user);

  const wantsAssign = patch.assignedToId !== undefined && patch.assignedToId !== ticket.assignedToId;
  let targetUser: { id: string; name: string } | null = null;

  if (wantsAssign) {
    if (user.role !== 'ADMIN') {
      const claiming = patch.assignedToId === user.id;
      const releasingOwn = patch.assignedToId === null && ticket.assignedToId === user.id;
      if (!claiming && !releasingOwn) {
        throw forbidden('Atendente pode apenas assumir tickets livres ou liberar os próprios');
      }
    }
    if (patch.assignedToId) {
      const found = await prisma.user.findUnique({
        where: { id: patch.assignedToId },
        select: { id: true, name: true, active: true },
      });
      if (!found || !found.active) throw badRequest('Usuário de destino inválido ou inativo');
      targetUser = { id: found.id, name: found.name };
    }
  }

  const changesStatus = patch.status !== undefined && patch.status !== ticket.status;
  const changesPriority = patch.priority !== undefined && patch.priority !== ticket.priority;

  if (!changesStatus && !changesPriority && !wantsAssign) {
    return serializeTicketDetail(ticket); // nada a fazer
  }

  await prisma.$transaction(async (tx) => {
    const data: Prisma.TicketUncheckedUpdateInput = {};

    if (changesStatus && patch.status) {
      data.status = patch.status;
      data.closedAt = CLOSED_STATUSES.includes(patch.status) ? (ticket.closedAt ?? new Date()) : null;
      await tx.ticketInteraction.create({
        data: {
          ticketId: ticket.id,
          type: InteractionType.STATUS_CHANGE,
          authorId: user.id,
          metadata: toJson({ kind: 'status', from: ticket.status, to: patch.status }),
        },
      });
      await writeAudit(tx, {
        entityType: 'TICKET',
        entityId: ticket.id,
        action: 'STATUS_CHANGED',
        actorId: user.id,
        data: { from: ticket.status, to: patch.status },
      });
    }

    if (changesPriority && patch.priority) {
      data.priority = patch.priority;
      await tx.ticketInteraction.create({
        data: {
          ticketId: ticket.id,
          type: InteractionType.SYSTEM,
          authorId: user.id,
          metadata: toJson({ kind: 'priority', from: ticket.priority, to: patch.priority }),
        },
      });
      await writeAudit(tx, {
        entityType: 'TICKET',
        entityId: ticket.id,
        action: 'PRIORITY_CHANGED',
        actorId: user.id,
        data: { from: ticket.priority, to: patch.priority },
      });
    }

    if (wantsAssign) {
      data.assignedToId = patch.assignedToId ?? null;
      await tx.ticketInteraction.create({
        data: {
          ticketId: ticket.id,
          type: InteractionType.ASSIGNMENT,
          authorId: user.id,
          metadata: toJson({
            kind: 'assignment',
            from: ticket.assignedToId,
            fromName: ticket.assignedTo?.name ?? null,
            to: patch.assignedToId ?? null,
            toName: targetUser?.name ?? null,
          }),
        },
      });
      await writeAudit(tx, {
        entityType: 'TICKET',
        entityId: ticket.id,
        action: patch.assignedToId ? 'ASSIGNED' : 'UNASSIGNED',
        actorId: user.id,
        data: { from: ticket.assignedToId, to: patch.assignedToId ?? null },
      });
    }

    await tx.ticket.update({ where: { id: ticket.id }, data });
  });

  return getTicket(id, user);
}

// ─── Agente de Pré-Venda IA (bot_ativo) ──────────────────────────────────────

/**
 * Liga/desliga o atendimento automático por IA nesta conversa. Registra o evento
 * na linha do tempo. Ao ativar, se a última mensagem for do cliente, o bot
 * responde imediatamente (fire-and-forget).
 */
export async function setBotEnabled(id: string, enabled: boolean, user: CurrentUser) {
  const ticket = await getScopedTicket(id, user);

  if (ticket.botEnabled !== enabled) {
    await prisma.$transaction(async (tx) => {
      await tx.ticket.update({ where: { id }, data: { botEnabled: enabled } });
      await tx.ticketInteraction.create({
        data: {
          ticketId: id,
          type: InteractionType.SYSTEM,
          authorId: user.id,
          body: enabled ? 'Atendimento por IA ativado' : 'Atendimento por IA desligado',
          metadata: toJson({ kind: 'ai', event: 'toggle', enabled }),
        },
      });
    });
  }

  if (enabled) void handleInboundMessage(id);

  return getTicket(id, user);
}

// ─── Interações (resposta ao cliente / nota interna) ─────────────────────────

export interface AddInteractionInput {
  type: 'AGENT_REPLY' | 'INTERNAL_NOTE';
  body: string;
}

export async function addInteraction(id: string, input: AddInteractionInput, user: CurrentUser) {
  const ticket = await getScopedTicket(id, user);
  let replyInteractionId: string | null = null;

  await prisma.$transaction(async (tx) => {
    const data: Prisma.TicketUncheckedUpdateInput = {};

    // Responder um ticket livre assume o atendimento automaticamente.
    if (input.type === 'AGENT_REPLY' && !ticket.assignedToId) {
      data.assignedToId = user.id;
      await tx.ticketInteraction.create({
        data: {
          ticketId: ticket.id,
          type: InteractionType.ASSIGNMENT,
          authorId: user.id,
          metadata: toJson({ kind: 'assignment', from: null, to: user.id, toName: user.name, auto: true }),
        },
      });
      await writeAudit(tx, {
        entityType: 'TICKET',
        entityId: ticket.id,
        action: 'ASSIGNED',
        actorId: user.id,
        data: { from: null, to: user.id, auto: true },
      });
    }

    const created = await tx.ticketInteraction.create({
      data: {
        ticketId: ticket.id,
        type: input.type === 'AGENT_REPLY' ? InteractionType.AGENT_REPLY : InteractionType.INTERNAL_NOTE,
        authorId: user.id,
        body: input.body,
      },
    });
    if (input.type === 'AGENT_REPLY') replyInteractionId = created.id;

    if (input.type === 'AGENT_REPLY') {
      if (!ticket.firstResponseAt) data.firstResponseAt = new Date();
      if (ticket.status === TicketStatus.NEW) {
        data.status = TicketStatus.IN_PROGRESS;
        await tx.ticketInteraction.create({
          data: {
            ticketId: ticket.id,
            type: InteractionType.STATUS_CHANGE,
            authorId: user.id,
            metadata: toJson({ kind: 'status', from: TicketStatus.NEW, to: TicketStatus.IN_PROGRESS, auto: true }),
          },
        });
        await writeAudit(tx, {
          entityType: 'TICKET',
          entityId: ticket.id,
          action: 'STATUS_CHANGED',
          actorId: user.id,
          data: { from: TicketStatus.NEW, to: TicketStatus.IN_PROGRESS, auto: true },
        });
      }
    }

    // updatedAt é @updatedAt — qualquer update o toca; garante que o ticket suba na lista
    await tx.ticket.update({ where: { id: ticket.id }, data });
  });

  // Comunicação bidirecional: replica a resposta do operador de volta à plataforma
  // de origem (ex.: OLX), se a integração estiver conectada e com sync ativa.
  // Não bloqueia nem falha o fluxo do CRM — o resultado vira log de despacho.
  if (input.type === 'AGENT_REPLY' && replyInteractionId) {
    const vehicle = (ticket.vehicleRefExternal as NormalizedLead['vehicle']) ?? undefined;
    await dispatchOutboundReply({
      platform: ticket.platform,
      ticketId: ticket.id,
      interactionId: replyInteractionId,
      leadName: ticket.lead.name,
      externalLeadId: ticket.lead.externalId,
      body: input.body,
      vehicle,
    });
  }

  return getTicket(id, user);
}
