import { Router } from 'express';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { authenticate, requireRole } from '../../middleware/auth';
import { ah, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { writeAudit } from '../audit/audit.service';

export const leadsRouter = Router();
leadsRouter.use(authenticate);

const searchSchema = z.object({
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

/** Busca de leads por nome/telefone/e-mail — usada para vincular consultas de crédito. */
leadsRouter.get(
  '/',
  ah(async (req, res) => {
    const { search, limit } = searchSchema.parse(req.query);
    const where = search
      ? {
          anonymizedAt: null,
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search.replace(/\D/g, '') } },
          ],
        }
      : { anonymizedAt: null };
    const leads = await prisma.lead.findMany({
      where,
      select: { id: true, name: true, phone: true, email: true, platform: true },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    res.json(leads);
  }),
);

/**
 * LGPD — direito de acesso e portabilidade (art. 18, II e V): exporta TODOS os
 * dados pessoais mantidos sobre um titular, em formato estruturado e legível
 * por máquina (JSON). Inclui identificação, contatos, tickets, histórico de
 * mensagens e consultas de crédito vinculadas.
 */
leadsRouter.get(
  '/:id/export',
  requireRole(UserRole.ADMIN),
  ah(async (req, res) => {
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id },
      include: {
        tickets: {
          include: {
            interactions: {
              orderBy: { createdAt: 'asc' },
              select: { type: true, body: true, createdAt: true },
            },
          },
        },
        creditQueries: {
          select: { id: true, docType: true, score: true, createdAt: true, report: true },
        },
      },
    });
    if (!lead) throw notFound('Lead não encontrado');

    logger.info('exportação de dados do titular (LGPD)', { leadId: lead.id, actor: req.user!.id });
    await writeAudit(prisma, {
      entityType: 'LEAD',
      entityId: lead.id,
      action: 'LEAD_EXPORTED',
      actorId: req.user!.id,
      data: { tickets: lead.tickets.length },
    });

    res.setHeader('Content-Disposition', `attachment; filename="titular-${lead.id}.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      subject: {
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        document: lead.document,
        platform: lead.platform,
        extra: lead.extra,
        createdAt: lead.createdAt,
        anonymizedAt: lead.anonymizedAt,
      },
      tickets: lead.tickets.map((t) => ({
        number: t.number,
        status: t.status,
        platform: t.platform,
        createdAt: t.createdAt,
        interactions: t.interactions,
      })),
      creditQueries: lead.creditQueries,
    });
  }),
);

/**
 * LGPD — direito ao esquecimento (art. 18): anonimiza os dados pessoais do lead.
 * Mantém o ticket e as métricas (número, status, tempos), mas remove o vínculo
 * com a pessoa: identificação, contatos, conteúdo das mensagens recebidas e os
 * payloads brutos de webhook associados.
 */
leadsRouter.post(
  '/:id/anonymize',
  requireRole(UserRole.ADMIN),
  ah(async (req, res) => {
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id },
      include: { tickets: { select: { id: true } } },
    });
    if (!lead) throw notFound('Lead não encontrado');

    const ticketIds = lead.tickets.map((t) => t.id);

    await prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          name: 'Lead anonimizado',
          phone: null,
          email: null,
          externalId: null,
          anonymizedAt: new Date(),
        },
      });

      if (ticketIds.length > 0) {
        await tx.ticketInteraction.updateMany({
          where: { ticketId: { in: ticketIds }, type: 'CUSTOMER_MESSAGE' },
          data: { body: '[conteúdo removido a pedido do titular — LGPD]', metadata: { anonymized: true } },
        });
        await tx.webhookEvent.updateMany({
          where: { ticketId: { in: ticketIds } },
          data: { payload: { anonymized: true } },
        });
      }

      await writeAudit(tx, {
        entityType: 'LEAD',
        entityId: lead.id,
        action: 'LEAD_ANONYMIZED',
        actorId: req.user!.id,
        data: { ticketsAffected: ticketIds.length },
      });
    });

    logger.info('lead anonimizado (LGPD)', { leadId: lead.id, actor: req.user!.id });
    res.json({ ok: true, ticketsAffected: ticketIds.length });
  }),
);
