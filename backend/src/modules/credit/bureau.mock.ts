import type { DocType } from '../../lib/document';
import { formatDocument } from '../../lib/document';

/**
 * Bureau de crédito MOCKADO — determinístico por documento (mesmo CPF/CNPJ →
 * mesmo resultado). Substituir por integração real (Serasa/SPC/Boa Vista)
 * mantendo o contrato CreditReport; nada no restante do módulo precisa mudar.
 */

export type ScoreBand = 'HIGH_RISK' | 'MEDIUM_RISK' | 'LOW_RISK';

export interface CreditReport {
  document: string; // formatado
  docType: DocType;
  name: string;
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
  queriedAt: string;
  source: 'mock';
}

const FIRST = ['João', 'Maria', 'Carlos', 'Ana', 'Pedro', 'Fernanda', 'Rafael', 'Juliana', 'Bruno', 'Camila', 'Lucas', 'Patrícia'];
const LAST = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira', 'Costa', 'Almeida', 'Ferreira', 'Rodrigues', 'Martins'];
const COMPANY = ['Auto Peças', 'Transportes', 'Comércio', 'Serviços', 'Logística', 'Distribuidora', 'Motors', 'Veículos'];
const COMPANY_SUFFIX = ['LTDA', 'ME', 'EIRELI', 'S/A'];

function seedFrom(digits: string): number {
  let h = 2166136261;
  for (const ch of digits) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bandOf(score: number): ScoreBand {
  if (score <= 300) return 'HIGH_RISK';
  if (score <= 700) return 'MEDIUM_RISK';
  return 'LOW_RISK';
}

function headlineOf(band: ScoreBand, score: number): string {
  if (band === 'LOW_RISK') return score >= 850 ? 'Perfil Altamente Conversível' : 'Bom Perfil de Crédito';
  if (band === 'MEDIUM_RISK') return 'Perfil Moderado · Requer Análise';
  return 'Alto Risco · Aprovação Restrita';
}

const round = (n: number, step: number) => Math.round(n / step) * step;

export function generateReport(digits: string, docType: DocType): CreditReport {
  const seed = seedFrom(digits);
  const rand = rng(seed);

  // score com leve viés para o meio/alto (perfil típico de loja)
  const score = Math.min(1000, Math.max(20, Math.round(200 + rand() * 800)));
  const band = bandOf(score);

  // nome determinístico
  let name: string;
  let company: CreditReport['company'];
  if (docType === 'CNPJ') {
    name = `${COMPANY[seed % COMPANY.length]} ${LAST[(seed >>> 3) % LAST.length]} ${COMPANY_SUFFIX[(seed >>> 6) % COMPANY_SUFFIX.length]}`;
    const active = band !== 'HIGH_RISK' || rand() > 0.4;
    company = {
      active,
      situation: active ? 'Ativa e regularizada' : 'Pendências cadastrais na Receita',
      openedYear: 2000 + (seed % 24),
    };
  } else {
    name = `${FIRST[seed % FIRST.length]} ${LAST[(seed >>> 4) % LAST.length]} ${LAST[(seed >>> 8) % LAST.length]}`;
  }

  // restrições coerentes com a faixa de score
  let protests = 0;
  let negativacoes = 0;
  let badChecks = 0;
  let judicialActions = 0;
  if (band === 'MEDIUM_RISK') {
    protests = rand() > 0.6 ? 1 : 0;
    negativacoes = rand() > 0.5 ? 1 : 0;
  } else if (band === 'HIGH_RISK') {
    protests = 1 + Math.floor(rand() * 3);
    negativacoes = 1 + Math.floor(rand() * 3);
    badChecks = rand() > 0.5 ? Math.floor(rand() * 2) : 0;
    judicialActions = rand() > 0.6 ? 1 : 0;
  }
  const count = protests + negativacoes + badChecks + judicialActions;
  const totalAmount = count === 0 ? 0 : round(count * (800 + rand() * 6000), 50);

  // crédito estimado — cresce com o score; CNPJ tem teto maior
  const ceiling = docType === 'CNPJ' ? 220000 : 120000;
  const limit = band === 'HIGH_RISK' && count > 2 ? 0 : round(Math.pow(score / 1000, 1.4) * ceiling, 500);
  const downPaymentPct = band === 'LOW_RISK' ? 0 : band === 'MEDIUM_RISK' ? 20 : 40;
  const downPaymentLabel =
    downPaymentPct === 0
      ? 'Financiamento sem entrada disponível'
      : `Necessita de pelo menos ${downPaymentPct}% de entrada`;
  const installmentEstimate = limit > 0 ? round((limit * 1.28) / 48, 10) : 0;

  return {
    document: formatDocument(digits),
    docType,
    name,
    score,
    band,
    bandLabel: band === 'LOW_RISK' ? 'Risco Baixo' : band === 'MEDIUM_RISK' ? 'Risco Médio' : 'Risco Alto',
    headline: headlineOf(band, score),
    restrictions: {
      hasRestrictions: count > 0,
      protests,
      negativacoes,
      badChecks,
      judicialActions,
      totalAmount,
    },
    company,
    credit: { limit, downPaymentPct, downPaymentLabel, installmentEstimate },
    queriedAt: new Date().toISOString(),
    source: 'mock',
  };
}
