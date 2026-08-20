import type { FlowPolicy } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Política de tempo do atendimento e cálculo de quando a próxima ação vence.
 *
 * ── Os dois ramos do fluxo ──────────────────────────────────────────────────
 * O mesmo intervalo de silêncio leva a ações OPOSTAS, dependendo de quem está
 * devendo resposta:
 *
 *   cliente escreveu, a loja não respondeu  → SLA da equipe. Alerta interno.
 *                                             Nunca cutucar quem espera por nós.
 *   a loja respondeu, o cliente sumiu       → follow-up ao cliente, em escada,
 *                                             até encerrar por falta de resposta.
 *
 * Juntar os dois é o erro clássico desse tipo de automação: manda "ainda tem
 * interesse?" para alguém que está esperando a loja responder.
 */

export interface ResolvedPolicy {
  enabled: boolean;
  followUpDelaysMin: number[];
  autoCloseAfterMin: number;
  quietHoursStart: number;
  quietHoursEnd: number;
  timezone: string;
  businessDaysOnly: boolean;
  slaFirstResponseMin: number;
  followUpMode: 'ai' | 'template';
}

export const DEFAULT_POLICY: ResolvedPolicy = {
  enabled: false,
  followUpDelaysMin: [30, 240, 1440],
  autoCloseAfterMin: 4320,
  quietHoursStart: 20,
  quietHoursEnd: 8,
  timezone: 'America/Sao_Paulo',
  businessDaysOnly: false,
  slaFirstResponseMin: 30,
  followUpMode: 'ai',
};

export function resolvePolicyRow(row: FlowPolicy | null): ResolvedPolicy {
  if (!row) return { ...DEFAULT_POLICY };
  const delays = Array.isArray(row.followUpDelaysMin)
    ? (row.followUpDelaysMin as number[]).filter((n) => typeof n === 'number' && n > 0)
    : DEFAULT_POLICY.followUpDelaysMin;
  return {
    enabled: row.enabled,
    followUpDelaysMin: delays.length > 0 ? delays : DEFAULT_POLICY.followUpDelaysMin,
    autoCloseAfterMin: row.autoCloseAfterMin,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
    timezone: row.timezone,
    businessDaysOnly: row.businessDaysOnly,
    slaFirstResponseMin: row.slaFirstResponseMin,
    followUpMode: row.followUpMode === 'template' ? 'template' : 'ai',
  };
}

export async function getPolicy(accountId: string): Promise<ResolvedPolicy> {
  return resolvePolicyRow(await prisma.flowPolicy.findUnique({ where: { accountId } }));
}

// ─── Janela de silêncio ──────────────────────────────────────────────────────

/** Hora local (0–23) e dia da semana (0=domingo) no fuso da loja. */
function localParts(at: Date, timezone: string): { hour: number; weekday: number } {
  // Intl é a forma correta de converter fuso: lida com horário de verão e com
  // mudanças de regra, coisa que deslocamento fixo em minutos não faz.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(at);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '12');
  const wdName = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wdName);
  return { hour: hour === 24 ? 0 : hour, weekday: weekday < 0 ? 1 : weekday };
}

/** true quando o horário cai na janela em que nada deve ser enviado. */
export function isQuiet(at: Date, policy: ResolvedPolicy): boolean {
  const { hour, weekday } = localParts(at, policy.timezone);
  if (policy.businessDaysOnly && (weekday === 0 || weekday === 6)) return true;

  const { quietHoursStart: start, quietHoursEnd: end } = policy;
  if (start === end) return false; // janela vazia = sempre pode
  // Janela que cruza a meia-noite (ex.: 20h → 8h) precisa do OU, não do E.
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

/** Adia o instante para o fim da janela de silêncio, se necessário. */
export function nextAllowedTime(at: Date, policy: ResolvedPolicy): Date {
  let candidate = new Date(at);
  // Avança de hora em hora até sair da janela. Teto de 72 tentativas (3 dias)
  // impede laço infinito se a configuração for degenerada.
  for (let i = 0; i < 72 && isQuiet(candidate, policy); i++) {
    candidate = new Date(candidate.getTime() + 3_600_000);
  }
  return candidate;
}

// ─── Cálculo do vencimento ───────────────────────────────────────────────────

export interface TicketClock {
  status: string;
  followUpCount: number;
  botEnabled: boolean;
  lastCustomerMessageAt: Date | null;
  firstResponseAt: Date | null;
  createdAt: Date;
}

const OPEN_STATUSES = ['NEW', 'IN_PROGRESS', 'WAITING_CUSTOMER'];

/**
 * Quando a próxima ação automática deste ticket vence — ou null se ele não está
 * sob o motor de fluxo.
 *
 * O ticket sai do motor quando: a política está desligada, o ticket foi fechado,
 * a conversa está com um humano (bot desligado depois de transbordo), ou a
 * escada de follow-ups acabou e o encerramento já passou.
 */
export function computeNextAction(
  ticket: TicketClock,
  policy: ResolvedPolicy,
  now = new Date(),
): { at: Date; kind: 'followup' | 'close' } | null {
  if (!policy.enabled) return null;
  if (!OPEN_STATUSES.includes(ticket.status)) return null;

  // Marco do silêncio: a última vez que o CLIENTE falou. Enquanto ele não tiver
  // falado nada, não há silêncio de cliente para cobrar.
  const since = ticket.lastCustomerMessageAt ?? ticket.createdAt;

  // Encerramento vence antes de qualquer follow-up restante?
  const closeAt = new Date(since.getTime() + policy.autoCloseAfterMin * 60_000);

  const delays = policy.followUpDelaysMin;
  if (ticket.followUpCount < delays.length) {
    const delay = delays[ticket.followUpCount];
    const dueAt = new Date(since.getTime() + delay * 60_000);
    if (dueAt < closeAt) {
      // Follow-up é mensagem ao cliente: respeita a janela de silêncio.
      return { at: nextAllowedTime(dueAt < now ? now : dueAt, policy), kind: 'followup' };
    }
  }

  // Encerrar é ação interna — não acorda ninguém, então ignora a janela.
  return { at: closeAt, kind: 'close' };
}

/** Recalcula e grava `nextActionAt` do ticket. Chamado a cada mudança de estado. */
export async function rescheduleTicket(ticketId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      accountId: true, status: true, followUpCount: true, botEnabled: true,
      lastCustomerMessageAt: true, firstResponseAt: true, createdAt: true,
    },
  });
  if (!ticket) return;

  const policy = await getPolicy(ticket.accountId);
  const next = computeNextAction(ticket, policy);
  await prisma.ticket.update({
    where: { id: ticketId },
    data: { nextActionAt: next?.at ?? null },
  });
}

/**
 * Reprograma todos os tickets abertos de uma conta. Usado quando a loja altera a
 * política: a mudança passa a valer para as conversas em andamento, não só para
 * as futuras — que é o comportamento que o lojista espera ao mexer no ajuste.
 */
export async function rescheduleAccount(accountId: string): Promise<number> {
  const policy = await getPolicy(accountId);
  const tickets = await prisma.ticket.findMany({
    where: { accountId, status: { in: OPEN_STATUSES as never[] } },
    select: {
      id: true, status: true, followUpCount: true, botEnabled: true,
      lastCustomerMessageAt: true, firstResponseAt: true, createdAt: true,
    },
  });

  let updated = 0;
  for (const t of tickets) {
    const next = computeNextAction(t, policy);
    await prisma.ticket.update({ where: { id: t.id }, data: { nextActionAt: next?.at ?? null } });
    updated += 1;
  }
  return updated;
}
