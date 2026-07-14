/**
 * Política de retenção e expurgo (LGPD art. 15/16 — término do tratamento).
 *
 * Remove dados pessoais que não precisam mais ser mantidos, respeitando as
 * janelas configuráveis em `env.retention`. Idempotente e seguro para rodar
 * periodicamente (cron/agendador). NÃO apaga tickets/leads em si — apenas os
 * dados brutos e derivados com prazo de validade.
 */
import { WebhookEventStatus } from '@prisma/client';
import { env } from '../config/env';
import { logger } from './logger';
import { prisma } from './prisma';

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 3_600_000);

export interface PurgeReport {
  webhookEvents: number;
  refreshTokens: number;
  creditQueries: number;
  auditLogs: number;
}

export async function runRetentionPurge(): Promise<PurgeReport> {
  // 1) payloads brutos de webhook já processados/falhos (contêm PII em texto claro)
  const webhookEvents = await prisma.webhookEvent.deleteMany({
    where: {
      status: { in: [WebhookEventStatus.PROCESSED, WebhookEventStatus.FAILED] },
      receivedAt: { lt: daysAgo(env.retention.webhookEventDays) },
    },
  });

  // 2) refresh tokens expirados ou revogados (não têm mais utilidade)
  const refreshTokens = await prisma.refreshToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }],
    },
  });

  // 3) consultas de crédito além da janela (dado financeiro sensível — CPF/CNPJ)
  const creditQueries = await prisma.creditQuery.deleteMany({
    where: { createdAt: { lt: daysAgo(env.retention.creditQueryDays) } },
  });

  // 4) trilha de auditoria antiga
  const auditLogs = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: daysAgo(env.retention.auditLogDays) } },
  });

  const report: PurgeReport = {
    webhookEvents: webhookEvents.count,
    refreshTokens: refreshTokens.count,
    creditQueries: creditQueries.count,
    auditLogs: auditLogs.count,
  };
  logger.info('expurgo de retenção concluído (LGPD)', report as unknown as Record<string, unknown>);
  return report;
}
