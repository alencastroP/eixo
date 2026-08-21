import { UsageMetric, type Prisma } from '@prisma/client';
import { badRequest, notFound } from '../../lib/errors';
import { validateDocument, maskDocument } from '../../lib/document';
import { CREDIT_CONSENT_VERSION } from '../../lib/legal-versions';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { hasQuota, recordUsage } from '../billing/usage.service';
import { generateReport, type CreditReport } from './bureau.mock';

interface Actor {
  id: string;
  name: string;
  /** Conta do operador - usada para não vincular consulta a titular de outra loja. */
  accountId: string;
}

/**
 * Confirmação de consentimento exigida do OPERADOR humano antes de consultar
 * (legal/09-CONSENTIMENTO-CONSULTA-DE-CREDITO.md, Parte D, item 8.1). O
 * titular é sempre quem autoriza - o operador só declara que obteve e por
 * qual canal.
 */
export interface ConsentInput {
  leadId: string;
  consentConfirmed: boolean;
  consentSource: string;
}

/**
 * Grava o consentimento no lead (regrava sempre - cada consulta reconfirma) e
 * devolve o titular, já validado como pertencente à conta do ator. Bloqueia
 * no servidor quando o checkbox não foi marcado: a interface já força isso,
 * mas quem decide não pode ser só o cliente.
 */
async function registerConsent(consent: ConsentInput, accountId: string) {
  const lead = await prisma.lead.findUnique({
    where: { id: consent.leadId },
    select: { id: true, accountId: true },
  });
  if (!lead || lead.accountId !== accountId) throw badRequest('Lead não encontrado', 'LEAD_NOT_FOUND');

  if (!consent.consentConfirmed) {
    throw badRequest(
      'Confirme que o cliente foi informado e autorizou a consulta antes de continuar.',
      'CREDIT_CONSENT_REQUIRED',
    );
  }
  const source = consent.consentSource?.trim();
  if (!source) {
    throw badRequest('Informe o canal pelo qual o cliente autorizou.', 'CREDIT_CONSENT_SOURCE_REQUIRED');
  }

  await prisma.lead.update({
    where: { id: lead.id },
    data: { creditConsentAt: new Date(), creditConsentSource: source, creditConsentVersion: CREDIT_CONSENT_VERSION },
  });

  return lead;
}

function serialize(row: {
  id: string;
  score: number;
  report: Prisma.JsonValue;
  leadId: string | null;
  createdAt: Date;
  lead?: { id: string; name: string } | null;
}) {
  return {
    id: row.id,
    score: row.score,
    report: row.report as unknown as CreditReport,
    leadId: row.leadId,
    lead: row.lead ? { id: row.lead.id, name: row.lead.name } : null,
    createdAt: row.createdAt,
  };
}

/**
 * Consulta o bureau (mock) para um CPF/CNPJ, persiste o resultado no histórico
 * e devolve o diagnóstico completo. O documento é validado (dígitos verificadores)
 * antes de qualquer processamento.
 *
 * Vínculo a um lead e consentimento do titular são OBRIGATÓRIOS, não um passo
 * opcional posterior: sem um titular identificado não há como provar que a
 * consulta foi autorizada (legal/09-CONSENTIMENTO-CONSULTA-DE-CREDITO.md §6.3).
 */
export async function runQuery(rawDocument: string, actor: Actor, consent: ConsentInput) {
  const valid = validateDocument(rawDocument);
  if (!valid) throw badRequest('CPF ou CNPJ inválido. Verifique os dígitos informados.', 'INVALID_DOCUMENT');

  await registerConsent(consent, actor.accountId);

  // Consulta a bureau tem tarifa por unidade - a franquia do plano é o teto.
  // Diferente da IA (que apenas silencia), aqui o erro é explícito: quem
  // clicou precisa saber por que não veio resultado.
  if (!(await hasQuota(actor.accountId, UsageMetric.CREDIT_QUERY))) {
    throw badRequest(
      'A franquia de consultas de crédito deste mês acabou. Mude de plano em Administração › Pagamentos para liberar novas consultas.',
      'QUOTA_EXCEEDED',
    );
  }

  const report = generateReport(valid.digits, valid.docType);

  const row = await prisma.creditQuery.create({
    data: {
      document: valid.digits,
      docType: valid.docType,
      name: report.name,
      score: report.score,
      report: report as unknown as Prisma.InputJsonValue,
      actorId: actor.id,
      accountId: actor.accountId,
      leadId: consent.leadId,
    },
    include: { lead: { select: { id: true, name: true } } },
  });

  await recordUsage(actor.accountId, UsageMetric.CREDIT_QUERY);

  // log sem PII: documento mascarado, sem nome
  logger.info('consulta de crédito realizada', {
    queryId: row.id,
    docType: valid.docType,
    document: maskDocument(valid.digits),
    score: report.score,
    actor: actor.id,
    leadId: consent.leadId,
    consentSource: consent.consentSource,
  });

  return serialize(row);
}

/** Últimas N consultas da conta (histórico recente exibido na tela de entrada). */
export async function recentQueries(accountId: string, limit = 5) {
  const rows = await prisma.creditQuery.findMany({
    where: { accountId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { lead: { select: { id: true, name: true } } },
  });
  return rows.map(serialize);
}

export async function getQuery(id: string, accountId: string) {
  const row = await prisma.creditQuery.findUnique({
    where: { id },
    include: { lead: { select: { id: true, name: true } } },
  });
  // Mesmo tratamento de IDOR já usado no resto do app: consulta de outra
  // conta responde 404, nunca 403 (não confirma nem que o id existe).
  if (!row || row.accountId !== accountId) throw notFound('Consulta não encontrada');
  return serialize(row);
}

/** Corrige o lead ao qual uma consulta já existente está arquivada (não dispensa o consentimento já registrado na criação). */
export async function linkToLead(id: string, leadId: string, actor: Actor) {
  const [query, lead] = await Promise.all([
    prisma.creditQuery.findUnique({ where: { id } }),
    prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, name: true, accountId: true } }),
  ]);
  if (!query || query.accountId !== actor.accountId) throw notFound('Consulta não encontrada');
  // Vincular exige que o titular seja da mesma loja: caso contrário daria para
  // descobrir o nome de um lead de outra conta chutando ids.
  if (!lead || lead.accountId !== actor.accountId) throw badRequest('Lead não encontrado');

  const row = await prisma.creditQuery.update({
    where: { id },
    data: { leadId },
    include: { lead: { select: { id: true, name: true } } },
  });
  logger.info('consulta de crédito vinculada a lead', { queryId: id, leadId, actor: actor.id });
  return serialize(row);
}
