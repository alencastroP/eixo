/**
 * Adaptador do produto "Credito Mix" (Assertiva APIs V3) para o CreditReport.
 *
 * Este é o ÚNICO arquivo do projeto que conhece o formato da Assertiva.
 *
 * Por que Credito Mix e não "Score de Crédito" (/score/v3/...): o endpoint de
 * score devolve pontuação e protestos, mas NÃO devolve o nome do titular nem a
 * situação cadastral da empresa - e o laudo que a loja imprime tem o nome no
 * cabeçalho. O Mix traz `ocorrencias.cadastro` junto, com quantidades por
 * categoria já somadas, numa chamada só.
 *
 * `opcoes` é à la carte e cada item CUSTA a mais por consulta: pedimos ACOES
 * (ação judicial muda decisão de financiamento) e deixamos POSITIVO de fora
 * por padrão - os indicadores de Cadastro Positivo não aparecem nesta tela,
 * então seriam gasto sem leitor. Ver ASSERTIVA_OPCOES.
 *
 * Contrato conferido em https://integracao.assertivasolucoes.com.br/v3/doc/
 * (swagger "Credito Mix"), abril/2026.
 */
import { env } from '../../../config/env';
import { formatDocument, type DocType } from '../../../lib/document';
import { logger } from '../../../lib/logger';
import { assertivaGet } from './assertiva.client';
import { bandLabelOf, bandOf, estimateCredit, headlineOf } from './scoring';
import type { BureauProvider, BureauQuery, CreditReport, ScoreBand } from './types';

// ─── Formato cru da Assertiva (só o que consumimos) ──────────────────────────

interface Resumo {
  sumQuantidade?: number | null;
  sumValorTotal?: number | null;
}

interface MixResponse {
  cabecalho?: {
    dataHora?: string;
    protocolo?: string;
    reconsulta?: boolean;
    entrada?: { opcoesCobradas?: string[] };
  };
  resposta?: {
    resumos?: {
      debitos?: Resumo | null;
      cheques?: Resumo | null;
      protestos?: Resumo | null;
      acoes?: Resumo | null;
      rendaPresumida?: number | string | null;
      faturamentoPresumido?: number | string | null;
    } | null;
    ocorrencias?: {
      cadastro?: {
        nome?: string | null; // PF
        razaoSocial?: string | null; // PJ
        nomeFantasia?: string | null;
        situacaoCadastral?: string | null;
        dataAbertura?: string | null; // dd/MM/yyyy
      } | null;
      // A Assertiva aninha duas vezes: ocorrencias.score.score.pontos
      score?: {
        score?: {
          pontos?: number | null;
          classe?: string | null;
          faixa?: { titulo?: string | null; descricao?: string | null } | null;
        } | null;
      } | null;
    } | null;
  } | null;
}

// ─── Normalizações ───────────────────────────────────────────────────────────

const qtd = (r: Resumo | null | undefined): number => Math.max(0, Math.trunc(r?.sumQuantidade ?? 0));
const valor = (r: Resumo | null | undefined): number => Math.max(0, r?.sumValorTotal ?? 0);

/**
 * "Não consta" é resposta válida deles para faturamento - vem como string onde
 * o PF traz número. Qualquer coisa que não seja número finito vira ausente.
 */
function toNumber(value: number | string | null | undefined): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const n = Number(value.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** "22/11/2021 11:42:56" → ISO. Sem isso a data do laudo viraria Invalid Date. */
function parseBrDateTime(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value.trim());
  if (!m) return new Date().toISOString();
  const [, d, mo, y, h = '00', mi = '00', s = '00'] = m;
  // Horário da Assertiva é de Brasília; sem o offset a hora do laudo andaria 3h.
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}-03:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function yearOf(value: string | null | undefined): number | undefined {
  const m = /(\d{4})$/.exec((value ?? '').trim());
  return m ? Number(m[1]) : undefined;
}

/**
 * Classe A–F da Assertiva → nossa faixa. Preferida sobre a régua por pontos:
 * a classe é o julgamento DELES sobre a própria pontuação, e é o que o painel
 * da Assertiva mostra ao lojista. Sem classe reconhecível, cai na régua nossa.
 */
function bandFromClasse(classe: string | null | undefined, score: number): ScoreBand {
  switch ((classe ?? '').trim().toUpperCase()) {
    case 'A':
    case 'B':
      return 'LOW_RISK';
    case 'C':
    case 'D':
      return 'MEDIUM_RISK';
    case 'E':
    case 'F':
      return 'HIGH_RISK';
    default:
      return bandOf(score);
  }
}

// ─── Tradução ────────────────────────────────────────────────────────────────

function toReport(raw: MixResponse, { digits, docType, fallbackName }: BureauQuery): CreditReport {
  const resumos = raw.resposta?.resumos ?? {};
  const cadastro = raw.resposta?.ocorrencias?.cadastro ?? {};
  const scoreNode = raw.resposta?.ocorrencias?.score?.score ?? {};

  const score = Math.min(1000, Math.max(0, Math.trunc(scoreNode.pontos ?? 0)));
  const band = bandFromClasse(scoreNode.classe, score);

  const protests = qtd(resumos.protestos);
  const negativacoes = qtd(resumos.debitos);
  const badChecks = qtd(resumos.cheques);
  const judicialActions = qtd(resumos.acoes);
  const restrictionCount = protests + negativacoes + badChecks + judicialActions;
  // Somar float de quatro origens rende 7857651.119999999; o laudo mostra
  // dinheiro, então arredonda para centavos antes de sair daqui.
  const totalAmount =
    Math.round(
      (valor(resumos.protestos) + valor(resumos.debitos) + valor(resumos.cheques) + valor(resumos.acoes)) * 100,
    ) / 100;

  const bureauName = docType === 'CNPJ' ? (cadastro.razaoSocial ?? cadastro.nomeFantasia) : cadastro.nome;
  const name = bureauName?.trim() || fallbackName?.trim() || 'Titular não identificado';

  const incomeEstimate = toNumber(
    docType === 'CNPJ' ? resumos.faturamentoPresumido : resumos.rendaPresumida,
  );

  let company: CreditReport['company'];
  if (docType === 'CNPJ') {
    const situation = cadastro.situacaoCadastral?.trim() || 'Situação não informada';
    company = {
      // A Receita usa ATIVA; qualquer outra coisa (BAIXADA, SUSPENSA, INAPTA)
      // é impedimento e não pode ser lida como "tudo certo".
      active: situation.toUpperCase() === 'ATIVA',
      situation,
      openedYear: yearOf(cadastro.dataAbertura) ?? 0,
    };
  }

  return {
    document: formatDocument(digits),
    docType,
    name,
    nameConfirmed: Boolean(bureauName?.trim()),
    score,
    band,
    // A faixa da Assertiva é o texto que o lojista vê no painel deles; manter o
    // mesmo rótulo evita a conversa "no site da Assertiva diz outra coisa".
    bandLabel: scoreNode.faixa?.titulo?.trim() || bandLabelOf(band),
    headline: scoreNode.faixa?.descricao?.trim() || headlineOf(band, score),
    restrictions: {
      hasRestrictions: restrictionCount > 0,
      protests,
      negativacoes,
      badChecks,
      judicialActions,
      totalAmount,
    },
    company,
    credit: estimateCredit({ score, band, docType, restrictionCount, monthlyIncome: incomeEstimate }),
    incomeEstimate,
    queriedAt: parseBrDateTime(raw.cabecalho?.dataHora),
    source: 'assertiva',
    protocol: raw.cabecalho?.protocolo,
    requeried: raw.cabecalho?.reconsulta === true,
  };
}

const PATH: Record<DocType, string> = { CPF: '/mix-v3/pf', CNPJ: '/mix-v3/pj' };

export const assertivaProvider: BureauProvider = {
  slug: 'assertiva',
  label: 'Assertiva',
  enabled: Boolean(env.credit.assertiva.clientId && env.credit.assertiva.clientSecret),

  async query(input: BureauQuery): Promise<CreditReport> {
    const raw = await assertivaGet<MixResponse>(
      `${PATH[input.docType]}/${input.digits}`,
      {
        // Finalidade LGPD 2 = "ciclo de crédito". É o enquadramento correto de
        // uma consulta de financiamento e precisa bater com o termo que o
        // titular assinou (legal/09-CONSENTIMENTO-CONSULTA-DE-CREDITO.md).
        idFinalidade: env.credit.assertiva.finalidade,
        opcoes: env.credit.assertiva.opcoes || undefined,
      },
      input.digits,
    );

    const report = toReport(raw, input);

    // `opcoesCobradas` é o que eles REALMENTE tarifaram - pode divergir do que
    // pedimos. Registrar permite conferir a fatura do bureau contra o uso.
    logger.info('laudo do bureau traduzido', {
      protocol: report.protocol,
      docType: input.docType,
      score: report.score,
      charged: raw.cabecalho?.entrada?.opcoesCobradas,
      requeried: report.requeried,
    });

    return report;
  },
};
