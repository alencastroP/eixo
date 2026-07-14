import type { Prisma } from '@prisma/client';
import { badRequest, notFound } from '../../lib/errors';
import { validateDocument, maskDocument } from '../../lib/document';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { generateReport, type CreditReport } from './bureau.mock';

interface Actor {
  id: string;
  name: string;
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
 */
export async function runQuery(rawDocument: string, actor: Actor) {
  const valid = validateDocument(rawDocument);
  if (!valid) throw badRequest('CPF ou CNPJ inválido. Verifique os dígitos informados.', 'INVALID_DOCUMENT');

  const report = generateReport(valid.digits, valid.docType);

  const row = await prisma.creditQuery.create({
    data: {
      document: valid.digits,
      docType: valid.docType,
      name: report.name,
      score: report.score,
      report: report as unknown as Prisma.InputJsonValue,
      actorId: actor.id,
    },
    include: { lead: { select: { id: true, name: true } } },
  });

  // log sem PII: documento mascarado, sem nome
  logger.info('consulta de crédito realizada', {
    queryId: row.id,
    docType: valid.docType,
    document: maskDocument(valid.digits),
    score: report.score,
    actor: actor.id,
  });

  return serialize(row);
}

/** Últimas N consultas (histórico recente exibido na tela de entrada). */
export async function recentQueries(limit = 5) {
  const rows = await prisma.creditQuery.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { lead: { select: { id: true, name: true } } },
  });
  return rows.map(serialize);
}

export async function getQuery(id: string) {
  const row = await prisma.creditQuery.findUnique({
    where: { id },
    include: { lead: { select: { id: true, name: true } } },
  });
  if (!row) throw notFound('Consulta não encontrada');
  return serialize(row);
}

/** Vincula a consulta a um lead/cliente existente. */
export async function linkToLead(id: string, leadId: string, actor: Actor) {
  const [query, lead] = await Promise.all([
    prisma.creditQuery.findUnique({ where: { id } }),
    prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, name: true } }),
  ]);
  if (!query) throw notFound('Consulta não encontrada');
  if (!lead) throw badRequest('Lead não encontrado');

  const row = await prisma.creditQuery.update({
    where: { id },
    data: { leadId },
    include: { lead: { select: { id: true, name: true } } },
  });
  logger.info('consulta de crédito vinculada a lead', { queryId: id, leadId, actor: actor.id });
  return serialize(row);
}
