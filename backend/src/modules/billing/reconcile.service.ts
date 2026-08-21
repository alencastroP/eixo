/**
 * Reconciliação com o gateway - a rede de segurança do webhook.
 *
 * Webhook se perde. Deploy no meio da entrega, instabilidade nossa, evento que
 * o gateway tentou enquanto o serviço reiniciava: nada disso é hipotético, e o
 * efeito é sempre um dos dois piores estados possíveis do produto - **cliente
 * pagando e bloqueado**, ou **cliente sem pagar e usando**.
 *
 * Esta rotina inverte o sentido da conversa: em vez de esperar o gateway
 * avisar, nós perguntamos. Roda por cron (scripts/billing-cycle.ts) e é
 * idempotente - reaplicar um pagamento já aplicado não muda nada.
 *
 * Não substitui o webhook (que é imediato e barato); cobre a falha dele.
 */
import { AccountStatus, ChargeStatus, SubscriptionStatus } from '@prisma/client';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { upsertCharge } from './billing.service';
import { gateway } from './gateway';

export interface ReconcileReport {
  /** Assinaturas consultadas no gateway. */
  checked: number;
  /** Cobranças criadas ou atualizadas a partir do estado remoto. */
  chargesSynced: number;
  /** Contas que estavam bloqueadas indevidamente e foram liberadas. */
  reactivated: number;
  /** Assinaturas em que o gateway e o banco discordavam. */
  divergences: number;
}

/** Status de cobrança que provam pagamento em dia. */
const PAID: ChargeStatus[] = [ChargeStatus.CONFIRMED, ChargeStatus.RECEIVED];

/**
 * Reconcilia todas as assinaturas ligadas ao gateway.
 *
 * `sinceDays` limita o esforço ao que mudou recentemente: reconciliar a base
 * inteira todo dia é desperdício de chamada de API sem ganho - assinatura
 * parada há meses não muda sozinha.
 */
export async function runReconciliation(options: { sinceDays?: number } = {}): Promise<ReconcileReport> {
  const gw = gateway();
  const report: ReconcileReport = { checked: 0, chargesSynced: 0, reactivated: 0, divergences: 0 };

  if (!gw.enabled) {
    logger.info('billing: reconciliação ignorada - gateway não configurado');
    return report;
  }

  const sinceDays = options.sinceDays ?? 45;
  const since = new Date(Date.now() - sinceDays * 86_400_000);

  const subscriptions = await prisma.subscription.findMany({
    where: {
      externalSubscriptionId: { not: null },
      OR: [{ updatedAt: { gte: since } }, { nextDueDate: { lte: new Date() } }, { status: SubscriptionStatus.PAST_DUE }],
    },
    select: { id: true, accountId: true, externalSubscriptionId: true, status: true },
  });

  for (const subscription of subscriptions) {
    report.checked += 1;
    try {
      const remote = await gw.listCharges(subscription.externalSubscriptionId!, 12);
      for (const charge of remote) {
        await upsertCharge(subscription.accountId, charge, subscription.id);
        report.chargesSynced += 1;
      }
      const changed = await realignAccess(subscription.accountId, subscription.status);
      if (changed) {
        report.divergences += 1;
        if (changed === 'reactivated') report.reactivated += 1;
      }
    } catch (err) {
      // Uma assinatura problemática não pode interromper a varredura das outras.
      logger.error('billing: falha ao reconciliar assinatura', {
        accountId: subscription.accountId,
        externalSubscriptionId: subscription.externalSubscriptionId,
        err,
      });
    }
  }

  logger.info('billing: reconciliação concluída', report as unknown as Record<string, unknown>);
  return report;
}

/**
 * Compara o que as cobranças dizem com o acesso que a conta tem, e corrige.
 *
 * Só age nos dois desalinhamentos que importam:
 *
 *  - **bloqueado mas em dia** → libera. É o erro mais grave do módulo: cliente
 *    pagou e não consegue trabalhar. Corrigido sem esperar ninguém abrir chamado.
 *  - **ativo com cobrança vencida** → marca a assinatura como PAST_DUE, o que
 *    coloca a conta na carência. O bloqueio em si continua sendo do dunning.
 *
 * Conta CANCELED nunca é reativada por aqui: encerramento é decisão do cliente.
 */
async function realignAccess(
  accountId: string,
  subscriptionStatus: SubscriptionStatus,
): Promise<'reactivated' | 'past_due' | null> {
  const account = await prisma.account.findUnique({ where: { id: accountId }, select: { status: true } });
  if (!account || account.status === AccountStatus.CANCELED) return null;

  const [paid, overdue] = await Promise.all([
    prisma.billingCharge.findFirst({
      where: { accountId, status: { in: PAID } },
      orderBy: { dueDate: 'desc' },
      select: { id: true, dueDate: true, paidAt: true },
    }),
    prisma.billingCharge.count({ where: { accountId, status: ChargeStatus.OVERDUE } }),
  ]);

  const blocked = account.status === AccountStatus.PAST_DUE || account.status === AccountStatus.EXPIRED;

  if (blocked && paid && overdue === 0) {
    await prisma.$transaction([
      prisma.account.update({ where: { id: accountId }, data: { status: AccountStatus.ACTIVE } }),
      prisma.subscription.updateMany({ where: { accountId }, data: { status: SubscriptionStatus.ACTIVE } }),
    ]);
    logger.warn('billing: divergência corrigida - conta estava bloqueada com pagamento em dia', {
      accountId,
      statusAnterior: account.status,
      chargeId: paid.id,
    });
    return 'reactivated';
  }

  if (account.status === AccountStatus.ACTIVE && overdue > 0 && subscriptionStatus !== SubscriptionStatus.PAST_DUE) {
    await prisma.subscription.updateMany({
      where: { accountId },
      data: { status: SubscriptionStatus.PAST_DUE },
    });
    logger.warn('billing: divergência corrigida - conta ativa com cobrança vencida', { accountId, overdue });
    return 'past_due';
  }

  return null;
}
