import type { DocType } from '../../../lib/document';
import { formatDocument } from '../../../lib/document';
import { bandLabelOf, bandOf, estimateCredit, headlineOf, round } from './scoring';
import type { BureauProvider, BureauQuery, CreditReport, ScoreBand } from './types';

/**
 * Bureau de crédito SIMULADO - determinístico por documento (mesmo CPF/CNPJ →
 * mesmo resultado).
 *
 * Continua existindo depois da integração real por três motivos: desenvolvimento
 * sem queimar consulta paga, ambiente de demonstração, e rede de segurança
 * quando falta credencial (ver index.ts). O laudo sai marcado `source: 'mock'`
 * e a tela estampa "Resultado simulado" - dado falso nunca passa por verdadeiro.
 */

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

export function generateReport(digits: string, docType: DocType, fallbackName?: string): CreditReport {
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
  // Em demonstração o titular do cadastro é mais convincente que um nome
  // sorteado - e deixa claro de quem é o laudo. Segue não conferido.
  if (fallbackName?.trim()) name = fallbackName.trim();

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

  return {
    document: formatDocument(digits),
    docType,
    name,
    // O mock inventa o nome, então ele nunca conta como conferido - a não ser
    // que o chamador tenha passado o titular do nosso próprio cadastro.
    nameConfirmed: false,
    score,
    band,
    bandLabel: bandLabelOf(band),
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
    credit: estimateCredit({ score, band, docType, restrictionCount: count }),
    queriedAt: new Date().toISOString(),
    source: 'mock',
  };
}

export const mockProvider: BureauProvider = {
  slug: 'mock',
  label: 'Simulado',
  enabled: true,
  async query({ digits, docType, fallbackName }: BureauQuery): Promise<CreditReport> {
    return generateReport(digits, docType, fallbackName);
  },
};
