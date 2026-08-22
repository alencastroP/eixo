import type { DocType } from '../../../lib/document';
import type { CreditReport, ScoreBand } from './types';

/**
 * Regras de leitura do score que são NOSSAS, não do bureau.
 *
 * O bureau entrega score e restrições; quanto isso vira de financiamento é
 * política da loja. Mantê-las aqui, fora dos adaptadores, é o que garante que
 * trocar de bureau (ou cair no mock) não mude o significado do que a tela
 * mostra - só a origem do dado.
 */

export const round = (n: number, step: number) => Math.round(n / step) * step;

export function bandOf(score: number): ScoreBand {
  if (score <= 300) return 'HIGH_RISK';
  if (score <= 700) return 'MEDIUM_RISK';
  return 'LOW_RISK';
}

export function bandLabelOf(band: ScoreBand): string {
  return band === 'LOW_RISK' ? 'Risco Baixo' : band === 'MEDIUM_RISK' ? 'Risco Médio' : 'Risco Alto';
}

export function headlineOf(band: ScoreBand, score: number): string {
  if (band === 'LOW_RISK') return score >= 850 ? 'Perfil Altamente Conversível' : 'Bom Perfil de Crédito';
  if (band === 'MEDIUM_RISK') return 'Perfil Moderado · Requer Análise';
  return 'Alto Risco · Aprovação Restrita';
}

interface CreditEstimateInput {
  score: number;
  band: ScoreBand;
  docType: DocType;
  /** Total de ocorrências restritivas - muitas zeram o limite. */
  restrictionCount: number;
  /**
   * Renda mensal (PF) ou faturamento (PJ) presumido pelo bureau. Quando o
   * bureau informa, ela vira TETO: oferecer 100 mil de financiamento a quem
   * ganha 1.800 por mês não é otimismo, é proposta que morre na análise.
   */
  monthlyIncome?: number;
}

/** Teto prudencial: 30 meses de renda. Acima disso a parcela não cabe em 48x. */
const INCOME_MULTIPLE = 30;

export function estimateCredit({
  score,
  band,
  docType,
  restrictionCount,
  monthlyIncome,
}: CreditEstimateInput): CreditReport['credit'] {
  const ceiling = docType === 'CNPJ' ? 220000 : 120000;
  let limit = band === 'HIGH_RISK' && restrictionCount > 2 ? 0 : round(Math.pow(score / 1000, 1.4) * ceiling, 500);

  if (monthlyIncome && monthlyIncome > 0) {
    limit = Math.min(limit, round(monthlyIncome * INCOME_MULTIPLE, 500));
  }

  const downPaymentPct = band === 'LOW_RISK' ? 0 : band === 'MEDIUM_RISK' ? 20 : 40;
  const downPaymentLabel =
    downPaymentPct === 0
      ? 'Financiamento sem entrada disponível'
      : `Necessita de pelo menos ${downPaymentPct}% de entrada`;
  const installmentEstimate = limit > 0 ? round((limit * 1.28) / 48, 10) : 0;

  return { limit, downPaymentPct, downPaymentLabel, installmentEstimate };
}
