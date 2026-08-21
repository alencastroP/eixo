/**
 * Medição de consumo por conta.
 *
 * O problema que isto resolve: o plano é FLAT, mas dois itens do produto têm
 * custo variável por conta - mensagem do Agente de IA (tokens) e consulta de
 * crédito (tarifa do bureau). Sem medir, uma revenda de alto volume consome
 * mais do que paga e a margem some sem aviso, conta por conta, em silêncio.
 *
 * A resposta aqui é cota, não cobrança-surpresa: cada plano inclui uma
 * franquia mensal; ao estourá-la, a capacidade é DESLIGADA (o atendimento
 * segue humano, o CRM inteiro continua funcionando) e o lojista vê o número na
 * tela de Pagamentos. Cobrar excedente que ninguém autorizou é o caminho curto
 * para chargeback e cancelamento.
 *
 * O período é o mês corrente no fuso de faturamento (America/Sao_Paulo): um
 * consumo às 22h de 31 de janeiro pertence a janeiro, não a fevereiro - que é
 * o que aconteceria contando em UTC.
 */
import { UsageMetric } from '@prisma/client';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { planFeatures } from './plans';

const BILLING_TZ = 'America/Sao_Paulo';

/** Período de faturamento ('YYYY-MM') de uma data, no fuso brasileiro. */
export function periodOf(date = new Date()): string {
  // en-CA formata como 'YYYY-MM-DD', o que torna o corte por prefixo trivial.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BILLING_TZ,
    year: 'numeric',
    month: '2-digit',
  }).format(date);
}

/**
 * Franquia da conta para uma métrica. `null` = ilimitada.
 *
 * Conta SEM plano vinculado fica sem cota, e não com cota zero. A diferença é
 * o dia inteiro de uma loja: o fallback de `planFeatures` é conservador (zera
 * os contadores quando o JSON está incompleto), e aplicá-lo a quem simplesmente
 * não tem vínculo de plano - base anterior ao SaaS, bug de backfill - travaria
 * o agente de IA e a consulta de crédito de um cliente em dia. Falta de plano é
 * problema nosso, não dele; mesma regra de limits.service.ts.
 */
export async function quotaFor(accountId: string, metric: UsageMetric): Promise<number | null> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { plan: { select: { features: true } } },
  });
  if (!account?.plan) return null;

  const features = planFeatures(account.plan.features);
  return metric === UsageMetric.AI_MESSAGE ? features.aiMessagesPerMonth : features.creditQueriesPerMonth;
}

/**
 * Soma consumo ao contador do período.
 *
 * O upsert com `increment` deixa a soma no banco: duas rodadas simultâneas do
 * worker respondendo dois leads da mesma loja não sobrescrevem uma à outra,
 * como aconteceria num read-modify-write na aplicação.
 */
export async function recordUsage(accountId: string, metric: UsageMetric, amount = 1): Promise<number> {
  const period = periodOf();
  const row = await prisma.usageCounter.upsert({
    where: { accountId_metric_period: { accountId, metric, period } },
    update: { used: { increment: amount } },
    create: { accountId, metric, period, used: amount },
  });
  return row.used;
}

export interface UsageStatus {
  metric: UsageMetric;
  period: string;
  used: number;
  quota: number | null;
  remaining: number | null;
  /** true quando a franquia acabou - a capacidade correspondente fica off. */
  exceeded: boolean;
}

export async function usageStatus(accountId: string, metric: UsageMetric): Promise<UsageStatus> {
  const period = periodOf();
  const [counter, quota] = await Promise.all([
    prisma.usageCounter.findUnique({
      where: { accountId_metric_period: { accountId, metric, period } },
      select: { used: true },
    }),
    quotaFor(accountId, metric),
  ]);

  const used = counter?.used ?? 0;
  return {
    metric,
    period,
    used,
    quota,
    remaining: quota === null ? null : Math.max(0, quota - used),
    exceeded: quota !== null && used >= quota,
  };
}

/** Consumo de todas as métricas medidas - alimenta a tela de Pagamentos. */
export async function usageOverview(accountId: string): Promise<UsageStatus[]> {
  return Promise.all([
    usageStatus(accountId, UsageMetric.AI_MESSAGE),
    usageStatus(accountId, UsageMetric.CREDIT_QUERY),
  ]);
}

/**
 * Porteiro da franquia: `true` quando ainda há saldo para consumir.
 *
 * Chamado ANTES de gastar (antes de disparar o modelo, antes de bater no
 * bureau). Em caso de falha na consulta, LIBERA: uma indisponibilidade do
 * nosso banco não pode virar interrupção de atendimento de quem está em dia.
 */
export async function hasQuota(accountId: string, metric: UsageMetric): Promise<boolean> {
  try {
    const status = await usageStatus(accountId, metric);
    if (status.exceeded) {
      logger.warn('cota do plano esgotada no período', {
        accountId,
        metric,
        period: status.period,
        used: status.used,
        quota: status.quota,
      });
    }
    return !status.exceeded;
  } catch (err) {
    logger.error('falha ao consultar cota - liberando por segurança', { accountId, metric, err });
    return true;
  }
}
