/**
 * Módulo de Plataforma: visão de todas as contas (para a conta operadora do
 * Eixo) e acesso de suporte temporário a uma conta de cliente.
 *
 * Acesso de suporte NÃO é um token invisível: é um usuário real, criado
 * dentro da conta do cliente com o perfil Administrador de lá, visível na
 * lista de usuários e em toda auditoria como qualquer outro. A sessão em si
 * (`SupportSession`) só guarda quem pediu, quando, por quanto tempo e por quê
 * - o acesso propriamente dito é o usuário.
 */
import { randomBytes } from 'node:crypto';
import { env } from '../../config/env';
import { badRequest, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { hashPassword, signAccessToken } from '../auth/auth.service';
import { writeAudit } from '../audit/audit.service';
import { limitsOverview } from '../billing/limits.service';
import { serializeCharge } from '../billing/billing.service';
import { adminProfileId, invalidateAccess } from '../roles/roles.service';

const MIN_DURATION_MINUTES = 15;
const MAX_DURATION_MINUTES = 240;
const DEFAULT_DURATION_MINUTES = 60;

function clampDuration(minutes?: number): number {
  if (!minutes || !Number.isFinite(minutes)) return DEFAULT_DURATION_MINUTES;
  return Math.min(MAX_DURATION_MINUTES, Math.max(MIN_DURATION_MINUTES, Math.floor(minutes)));
}

// ─── Listagem de contas ───────────────────────────────────────────────────────

/** Visão de uma conta para o painel de Plataforma: plano, cobrança, uso. */
export async function listAccountsOverview() {
  const accounts = await prisma.account.findMany({
    where: { id: { not: env.platformAccountId } },
    include: {
      plan: { select: { name: true, code: true, priceCents: true } },
      subscription: { select: { status: true, cycle: true, priceCents: true, nextDueDate: true } },
      _count: { select: { users: { where: { active: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return Promise.all(
    accounts.map(async (account) => {
      const [limits, lastCharge] = await Promise.all([
        limitsOverview(account.id),
        prisma.billingCharge.findFirst({ where: { accountId: account.id }, orderBy: { dueDate: 'desc' } }),
      ]);
      return {
        id: account.id,
        name: account.name,
        status: account.status,
        createdAt: account.createdAt,
        plan: account.plan ? { code: account.plan.code, name: account.plan.name, priceCents: account.plan.priceCents } : null,
        subscription: account.subscription,
        activeUsers: account._count.users,
        limits,
        lastCharge: lastCharge ? serializeCharge(lastCharge) : null,
      };
    }),
  );
}

/** Detalhe de uma conta: o overview + histórico de cobranças + usuários. */
export async function accountDetail(accountId: string) {
  if (accountId === env.platformAccountId) throw badRequest('Esta é a conta-plataforma');

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      plan: { select: { name: true, code: true, priceCents: true } },
      subscription: { select: { status: true, cycle: true, priceCents: true, nextDueDate: true, currentPeriodEnd: true } },
    },
  });
  if (!account) throw notFound('Conta não encontrada');

  const [limits, charges, users] = await Promise.all([
    limitsOverview(accountId),
    prisma.billingCharge.findMany({ where: { accountId }, orderBy: { dueDate: 'desc' }, take: 24 }),
    prisma.user.findMany({
      where: { accountId },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true, profile: { select: { name: true } } },
      orderBy: { name: 'asc' },
    }),
  ]);

  return {
    id: account.id,
    name: account.name,
    status: account.status,
    createdAt: account.createdAt,
    plan: account.plan ? { code: account.plan.code, name: account.plan.name, priceCents: account.plan.priceCents } : null,
    subscription: account.subscription,
    limits,
    charges: charges.map(serializeCharge),
    users,
  };
}

// ─── Sessões de suporte ────────────────────────────────────────────────────────

export interface StartSupportSessionInput {
  accountId: string;
  requestedById: string;
  reason?: string;
  durationMinutes?: number;
}

/**
 * Abre uma sessão de suporte: cria um usuário "Suporte Eixo" de verdade
 * dentro da conta do cliente (perfil Administrador de lá) e devolve um access
 * token válido só pela duração escolhida.
 *
 * Sem refresh token de propósito: se a sessão precisar de mais tempo, abre-se
 * outra. Isso evita ensinar o fluxo de refresh normal a respeitar um teto de
 * sessão diferente do access token padrão (15min) - e mantém o raio de
 * exposição de cada sessão pequeno e previsível.
 */
export async function startSupportSession(input: StartSupportSessionInput) {
  const { accountId, requestedById } = input;
  if (accountId === env.platformAccountId) {
    throw badRequest('Não é possível abrir uma sessão de suporte na própria conta-plataforma');
  }
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw notFound('Conta não encontrada');

  const durationMinutes = clampDuration(input.durationMinutes);
  const expiresAt = new Date(Date.now() + durationMinutes * 60_000);
  const profileId = await adminProfileId(prisma, accountId);

  const { session, accessToken } = await prisma.$transaction(async (tx) => {
    const supportUser = await tx.user.create({
      data: {
        name: 'Suporte Eixo',
        // sufixo aleatório: cada sessão tem seu próprio usuário, nunca reaproveitado
        email: `suporte+${randomBytes(6).toString('hex')}@eixocrm.com`,
        // senha aleatória de 32 bytes, nunca exibida - login por senha nunca é o caminho aqui
        passwordHash: hashPassword(randomBytes(32).toString('hex')),
        accountId,
        profileId,
        role: 'ADMIN',
        active: true,
      },
    });

    const session = await tx.supportSession.create({
      data: {
        accountId,
        requestedById,
        supportUserId: supportUser.id,
        reason: input.reason?.trim() || null,
        expiresAt,
      },
    });

    const accessToken = signAccessToken(supportUser, durationMinutes * 60);

    await writeAudit(tx, {
      entityType: 'ACCOUNT',
      entityId: accountId,
      action: 'SUPPORT_ACCESS_STARTED',
      actorId: requestedById,
      data: { sessionId: session.id, supportUserId: supportUser.id, reason: session.reason, expiresAt, durationMinutes },
    });

    return { session, accessToken };
  });

  return {
    accessToken,
    session: {
      id: session.id,
      accountId,
      accountName: account.name,
      expiresAt: session.expiresAt,
    },
  };
}

/** Encerra uma sessão de suporte: desativa o usuário temporário na hora. */
export async function endSupportSession(
  sessionId: string,
  actorId: string | null,
  endedBy: 'EXPIRED' | 'REVOKED' | 'MANUAL',
) {
  const session = await prisma.supportSession.findUnique({ where: { id: sessionId } });
  if (!session) throw notFound('Sessão de suporte não encontrada');
  if (session.endedAt) return session;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: session.supportUserId }, data: { active: false } });
    await tx.supportSession.update({ where: { id: sessionId }, data: { endedAt: new Date(), endedBy } });
    await writeAudit(tx, {
      entityType: 'ACCOUNT',
      entityId: session.accountId,
      action: 'SUPPORT_ACCESS_ENDED',
      actorId,
      data: { sessionId: session.id, supportUserId: session.supportUserId, endedBy },
    });
  });
  invalidateAccess(session.supportUserId);
}

/**
 * Varredura periódica: desativa o usuário temporário de toda sessão vencida
 * que ainda não foi encerrada. O access token já para de funcionar sozinho ao
 * expirar (sem refresh), mas o usuário "Suporte Eixo" continuaria `active`
 * (e visível na lista de usuários do cliente) até isso rodar. Agende como os
 * demais scripts de manutenção (`expire-trials.ts`, `billing-cycle.ts`).
 */
export async function sweepExpiredSupportSessions(): Promise<{ ended: number }> {
  const expired = await prisma.supportSession.findMany({
    where: { endedAt: null, expiresAt: { lte: new Date() } },
    select: { id: true },
  });
  for (const s of expired) {
    await endSupportSession(s.id, null, 'EXPIRED');
  }
  return { ended: expired.length };
}

/**
 * Encerra a PRÓPRIA sessão de suporte - chamada pela aba que está DENTRO da
 * conta do cliente (autenticada como o "Suporte Eixo", não como a
 * conta-plataforma). É por isso que não recebe `sessionId`: quem está
 * logado só pode ser dono de uma sessão de suporte por vez (`supportUserId`
 * é único), então o próprio `userId` já resolve qual encerrar.
 */
export async function endOwnSupportSession(userId: string): Promise<void> {
  const session = await prisma.supportSession.findUnique({ where: { supportUserId: userId } });
  if (!session || session.endedAt) return;
  await endSupportSession(session.id, userId, 'MANUAL');
}

/** Sessões ainda abertas (não encerradas e não vencidas) - para o painel de vigilância. */
export async function listActiveSupportSessions() {
  const sessions = await prisma.supportSession.findMany({
    where: { endedAt: null, expiresAt: { gt: new Date() } },
    include: {
      account: { select: { id: true, name: true } },
      requestedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { startedAt: 'desc' },
  });
  return sessions.map((s) => ({
    id: s.id,
    account: s.account,
    requestedBy: s.requestedBy,
    reason: s.reason,
    startedAt: s.startedAt,
    expiresAt: s.expiresAt,
  }));
}
