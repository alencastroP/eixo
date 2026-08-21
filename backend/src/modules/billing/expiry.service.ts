/**
 * Expiração automática de trials (rode via cron - ver scripts/expire-trials.ts).
 *
 * - Contas TRIAL vencidas (`trialEndsAt < agora`) → status EXPIRED (dados NÃO são
 *   apagados; apenas o acesso é bloqueado pelo guard/login).
 * - Aviso de pré-expiração: contas que vencem nos próximos N dias e ainda não
 *   foram avisadas recebem uma notificação por e-mail.
 */
import { AccountStatus, SubscriptionStatus } from '@prisma/client';
import { resolveAccountEmail, sendEmail } from '../../lib/email';
import { trialExpiredEmail, trialPreExpiryWarningEmail } from '../../lib/email-templates';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';

const PRE_EXPIRY_WARNING_DAYS = 2;

export interface ExpiryReport {
  expired: number;
  warned: number;
}

export async function runTrialExpiry(): Promise<ExpiryReport> {
  const now = new Date();

  // 1) expira trials vencidos
  const expiring = await prisma.account.findMany({
    where: { status: AccountStatus.TRIAL, trialEndsAt: { lt: now } },
    select: { id: true, name: true },
  });
  for (const acc of expiring) {
    await prisma.$transaction([
      prisma.account.update({ where: { id: acc.id }, data: { status: AccountStatus.EXPIRED } }),
      prisma.subscription.updateMany({
        where: { accountId: acc.id },
        data: { status: SubscriptionStatus.EXPIRED },
      }),
    ]);
    logger.info('trial expirado - acesso bloqueado (dados preservados)', { accountId: acc.id });

    const to = await resolveAccountEmail(acc.id);
    if (to) await sendEmail(to, trialExpiredEmail({ accountName: acc.name }));
  }

  // 2) aviso de pré-expiração (1–2 dias antes)
  const warnCutoff = new Date(now.getTime() + PRE_EXPIRY_WARNING_DAYS * 24 * 3_600_000);
  const toWarn = await prisma.account.findMany({
    where: {
      status: AccountStatus.TRIAL,
      trialEndsAt: { gte: now, lte: warnCutoff },
      expiryNotifiedAt: null,
    },
    select: { id: true, name: true, trialEndsAt: true },
  });
  for (const acc of toWarn) {
    const to = await resolveAccountEmail(acc.id);
    const daysLeft = Math.max(0, Math.ceil((acc.trialEndsAt!.getTime() - now.getTime()) / 86_400_000));
    if (to) {
      await sendEmail(to, trialPreExpiryWarningEmail({ accountName: acc.name, daysLeft, trialEndsAt: acc.trialEndsAt! }));
    }
    logger.info('aviso de pré-expiração do trial', { accountId: acc.id, to, daysLeft, trialEndsAt: acc.trialEndsAt });
    await prisma.account.update({ where: { id: acc.id }, data: { expiryNotifiedAt: now } });
  }

  const report: ExpiryReport = { expired: expiring.length, warned: toWarn.length };
  logger.info('rotina de expiração de trials concluída', report as unknown as Record<string, unknown>);
  return report;
}
