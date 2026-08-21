/**
 * Régua de inadimplência e fim de ciclo - o que acontece DEPOIS da cobrança.
 *
 * O webhook trata o instante ("venceu", "pagou"). Este serviço trata a
 * passagem do tempo, que webhook nenhum avisa: a carência que estourou, o
 * cancelamento agendado que chegou na data, a assinatura cujo período pago
 * acabou. Roda por cron (ver scripts/billing-cycle.ts).
 *
 * O princípio que decide o desenho: **bloquear é o último recurso, e sempre
 * reversível**. Nenhuma rotina daqui apaga dado. Um bloqueio se desfaz sozinho
 * no instante em que o pagamento entra (ver webhook.service.ts), sem passar
 * pelo suporte.
 */
import { AccountStatus, ChargeStatus, SubscriptionStatus } from '@prisma/client';
import { env } from '../../config/env';
import { resolveAccountEmail, sendEmail } from '../../lib/email';
import { billingAccessBlockedEmail, billingSubscriptionCanceledEmail } from '../../lib/email-templates';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';

const DAY_MS = 86_400_000;

export interface DunningReport {
  /** Contas bloqueadas por carência esgotada. */
  blocked: number;
  /** Cancelamentos agendados que chegaram ao fim do período pago. */
  canceled: number;
  /** Assinaturas cujo período pago venceu sem renovação registrada. */
  lapsed: number;
}

/**
 * Bloqueia quem passou da carência sem pagar.
 *
 * A conta entrou em carência quando o webhook marcou a assinatura como
 * PAST_DUE (cobrança vencida). Aqui só verificamos o relógio: se a cobrança
 * mais antiga em aberto venceu há mais de `BILLING_GRACE_DAYS`, o acesso é
 * suspenso.
 *
 * Por que reconsultar as cobranças em vez de confiar só no status da
 * assinatura: uma cobrança pode ter sido paga por fora (o lojista ligou para o
 * gateway, pagou por outro meio) e o evento se perdido. Olhar as cobranças em
 * aberto de verdade evita bloquear quem está em dia.
 */
async function blockExpiredGrace(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - env.billing.graceDays * DAY_MS);

  const candidates = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.PAST_DUE,
      account: { status: AccountStatus.ACTIVE },
    },
    select: { accountId: true, account: { select: { name: true } } },
  });

  let blocked = 0;
  for (const { accountId, account } of candidates) {
    const oldestOpen = await prisma.billingCharge.findFirst({
      where: { accountId, status: ChargeStatus.OVERDUE },
      orderBy: { dueDate: 'asc' },
      select: { id: true, dueDate: true },
    });

    // Nenhuma cobrança em aberto: a assinatura estava marcada por engano ou o
    // pagamento entrou por outro caminho. Devolve ao normal em vez de bloquear.
    if (!oldestOpen) {
      await prisma.subscription.updateMany({
        where: { accountId },
        data: { status: SubscriptionStatus.ACTIVE },
      });
      logger.info('billing: conta sem cobrança em aberto - carência encerrada sem bloqueio', { accountId });
      continue;
    }

    if (oldestOpen.dueDate.getTime() > cutoff.getTime()) continue; // ainda na carência

    await prisma.account.update({ where: { id: accountId }, data: { status: AccountStatus.PAST_DUE } });
    blocked += 1;
    logger.warn('billing: carência esgotada - acesso suspenso por inadimplência', {
      accountId,
      chargeId: oldestOpen.id,
      dueDate: oldestOpen.dueDate,
      graceDays: env.billing.graceDays,
    });

    const to = await resolveAccountEmail(accountId);
    if (to) await sendEmail(to, billingAccessBlockedEmail({ accountName: account.name }));
  }
  return blocked;
}

/**
 * Efetiva os cancelamentos agendados que chegaram ao fim do período pago.
 *
 * Quem cancela continua usando até o fim do mês que pagou (Termos, cl. 7.2) -
 * esta rotina é o momento em que esse prazo termina. Os dados seguem
 * preservados: o acesso fecha, a base fica, e a janela de exportação de 30
 * dias corre a partir daqui (Termos, cl. 20.2).
 */
async function closeScheduledCancellations(now: Date): Promise<number> {
  const due = await prisma.subscription.findMany({
    where: {
      cancelAtPeriodEnd: true,
      status: { not: SubscriptionStatus.CANCELED },
      OR: [{ currentPeriodEnd: { lte: now } }, { currentPeriodEnd: null }],
      account: { status: { in: [AccountStatus.ACTIVE, AccountStatus.PAST_DUE, AccountStatus.TRIAL] } },
    },
    select: { accountId: true, currentPeriodEnd: true, account: { select: { name: true } } },
  });

  for (const { accountId, currentPeriodEnd, account } of due) {
    await prisma.$transaction([
      prisma.subscription.update({
        where: { accountId },
        data: { status: SubscriptionStatus.CANCELED },
      }),
      prisma.account.update({ where: { id: accountId }, data: { status: AccountStatus.CANCELED } }),
    ]);
    logger.info('billing: cancelamento efetivado ao fim do período pago', { accountId, currentPeriodEnd });

    const to = await resolveAccountEmail(accountId);
    if (to) await sendEmail(to, billingSubscriptionCanceledEmail({ accountName: account.name }));
  }
  return due.length;
}

/**
 * Assinatura ativa cujo período pago venceu e nenhuma cobrança nova entrou.
 *
 * É o buraco entre os dois mundos: o gateway deveria ter emitido a renovação e
 * o webhook deveria ter chegado. Quando nada disso aconteceu, a conta ficaria
 * ativa para sempre sem pagar. Marcamos como PAST_DUE - o que a coloca na
 * carência, não em bloqueio - e a reconciliação tem a chance de corrigir antes
 * de o prazo estourar.
 */
async function lapseUnrenewed(now: Date): Promise<number> {
  // Só depois da carência: entre o vencimento e a compensação existe uma
  // janela normal em que ainda não há evento, e marcar ali geraria alarme falso.
  const cutoff = new Date(now.getTime() - env.billing.graceDays * DAY_MS);

  const lapsed = await prisma.subscription.updateMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: { lt: cutoff },
    },
    data: { status: SubscriptionStatus.PAST_DUE },
  });

  if (lapsed.count > 0) {
    logger.warn('billing: assinaturas com período vencido e sem renovação registrada', { count: lapsed.count });
  }
  return lapsed.count;
}

export async function runDunning(): Promise<DunningReport> {
  const now = new Date();

  // A ordem importa: marcar os vencidos primeiro faz com que eles já entrem na
  // carência nesta mesma rodada, em vez de esperar a próxima.
  const lapsed = await lapseUnrenewed(now);
  const blocked = await blockExpiredGrace(now);
  const canceled = await closeScheduledCancellations(now);

  const report: DunningReport = { blocked, canceled, lapsed };
  logger.info('billing: régua de inadimplência concluída', report as unknown as Record<string, unknown>);
  return report;
}
