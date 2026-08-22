import type { DocType } from '../../../lib/document';

/**
 * Contrato do bureau de crédito.
 *
 * O resto do sistema (tela de consulta, agente de IA, histórico) conhece APENAS
 * `CreditReport`. Trocar de bureau é escrever um novo `BureauProvider` e apontar
 * `CREDIT_BUREAU_PROVIDER` para ele - nenhum consumidor muda.
 *
 * O laudo é gravado como JSON no histórico (`CreditQuery.report`) e relido meses
 * depois: campo removido daqui quebra relatório antigo. Só ACRESCENTAR campos, e
 * sempre opcionais.
 */

export type ScoreBand = 'HIGH_RISK' | 'MEDIUM_RISK' | 'LOW_RISK';

/** Quem produziu o laudo. Vai gravado no histórico e decide o aviso na tela. */
export type BureauSource = 'mock' | 'assertiva';

export interface CreditReport {
  document: string; // formatado
  docType: DocType;
  name: string;
  /**
   * false quando o nome veio do NOSSO cadastro porque o bureau não devolveu o
   * titular. A tela precisa distinguir: nome não conferido não prova identidade.
   */
  nameConfirmed: boolean;
  score: number; // 0..1000
  band: ScoreBand;
  bandLabel: string; // "Risco Alto" | "Risco Médio" | "Risco Baixo"
  headline: string; // ex.: "Perfil Altamente Conversível"
  restrictions: {
    hasRestrictions: boolean;
    protests: number;
    negativacoes: number;
    badChecks: number;
    judicialActions: number;
    totalAmount: number; // soma das pendências (R$)
  };
  company?: {
    active: boolean;
    situation: string;
    openedYear: number;
  };
  credit: {
    limit: number; // limite de financiamento estimado (R$)
    downPaymentPct: number; // entrada recomendada (%)
    downPaymentLabel: string;
    installmentEstimate: number; // parcela estimada em 48x (R$)
  };
  /** Renda (PF) ou faturamento (PJ) presumido pelo bureau, quando disponível. */
  incomeEstimate?: number;
  queriedAt: string;
  source: BureauSource;
  /**
   * Protocolo do bureau. É a prova de que a consulta existiu e o que se
   * apresenta ao titular que pede explicação (LGPD art. 20). Ausente no mock.
   */
  protocol?: string;
  /** true quando o bureau serviu de cache e não tarifou a consulta de novo. */
  requeried?: boolean;
}

export interface BureauQuery {
  /** Documento só com dígitos, JÁ validado pelo chamador. */
  digits: string;
  docType: DocType;
  /** Nome do cadastro - usado quando o bureau não devolve o titular. */
  fallbackName?: string;
}

export interface BureauProvider {
  slug: BureauSource;
  label: string;
  /** false quando falta credencial: o registry cai no mock em vez de derrubar. */
  enabled: boolean;
  query(input: BureauQuery): Promise<CreditReport>;
}
