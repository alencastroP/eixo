import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/permissions';
import { ah, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { KNOWLEDGE_INJECT_BUDGET, resolveAgentProfile, resolveKnowledge } from './context.service';
import { rescheduleAccount, resolvePolicyRow } from '../flow/flow.service';

/**
 * Configuração do agente e do fluxo, POR CONTA (apenas ADMIN).
 * `req.account!.id` é sempre a origem do tenant - nunca corpo nem query.
 */
export const agentRouter = Router();
agentRouter.use(requirePermission('agent.manage'));

// ─── Persona ─────────────────────────────────────────────────────────────────

agentRouter.get(
  '/profile',
  ah(async (req, res) => {
    const accountId = req.account!.id;
    const [profile, knowledge] = await Promise.all([
      resolveAgentProfile(accountId),
      resolveKnowledge(accountId),
    ]);
    res.json({
      ...profile,
      knowledge: {
        docCount: knowledge.docCount,
        // Transparência sobre a estratégia em uso: injeção enquanto o corpus
        // couber no prefixo cacheado, recuperação sob demanda acima disso.
        mode: knowledge.useRetrieval ? 'retrieval' : 'injected',
        budgetChars: KNOWLEDGE_INJECT_BUDGET,
      },
    });
  }),
);

const profileSchema = z.object({
  enabled: z.boolean().optional(),
  storeName: z.string().trim().max(120).nullable().optional(),
  persona: z.string().trim().max(2000).nullable().optional(),
  rules: z.string().trim().max(8000).nullable().optional(),
  canSearchInventory: z.boolean().optional(),
  canQuoteCredit: z.boolean().optional(),
  canScheduleVisit: z.boolean().optional(),
});

agentRouter.put(
  '/profile',
  ah(async (req, res) => {
    const accountId = req.account!.id;
    const data = profileSchema.parse(req.body);
    await prisma.agentProfile.upsert({
      where: { accountId },
      update: data,
      create: { accountId, ...data },
    });
    res.json(await resolveAgentProfile(accountId));
  }),
);

// ─── Base de conhecimento ────────────────────────────────────────────────────

agentRouter.get(
  '/knowledge',
  ah(async (req, res) => {
    const docs = await prisma.knowledgeDoc.findMany({
      where: { accountId: req.account!.id },
      orderBy: { title: 'asc' },
      select: { id: true, title: true, content: true, enabled: true, updatedAt: true },
    });
    const chars = docs.filter((d) => d.enabled).reduce((n, d) => n + d.title.length + d.content.length, 0);
    res.json({ docs, chars, budgetChars: KNOWLEDGE_INJECT_BUDGET });
  }),
);

const docSchema = z.object({
  title: z.string().trim().min(2, 'Dê um título ao documento').max(160),
  content: z.string().trim().min(10, 'Escreva o conteúdo').max(20000),
  enabled: z.boolean().default(true),
});

agentRouter.post(
  '/knowledge',
  ah(async (req, res) => {
    const input = docSchema.parse(req.body);
    const doc = await prisma.knowledgeDoc.create({
      data: { ...input, accountId: req.account!.id },
    });
    res.status(201).json(doc);
  }),
);

agentRouter.put(
  '/knowledge/:id',
  ah(async (req, res) => {
    const input = docSchema.partial().parse(req.body);
    // updateMany com accountId no where: um id de outra conta simplesmente não
    // casa, em vez de exigir uma leitura extra só para comparar.
    const updated = await prisma.knowledgeDoc.updateMany({
      where: { id: req.params.id, accountId: req.account!.id },
      data: input,
    });
    if (updated.count === 0) throw notFound('Documento não encontrado');
    res.json(await prisma.knowledgeDoc.findUnique({ where: { id: req.params.id } }));
  }),
);

agentRouter.delete(
  '/knowledge/:id',
  ah(async (req, res) => {
    const deleted = await prisma.knowledgeDoc.deleteMany({
      where: { id: req.params.id, accountId: req.account!.id },
    });
    if (deleted.count === 0) throw notFound('Documento não encontrado');
    res.json({ ok: true });
  }),
);

// ─── Política de fluxo ───────────────────────────────────────────────────────

agentRouter.get(
  '/flow',
  ah(async (req, res) => {
    const row = await prisma.flowPolicy.findUnique({ where: { accountId: req.account!.id } });
    res.json(resolvePolicyRow(row));
  }),
);

const flowSchema = z.object({
  enabled: z.boolean().optional(),
  followUpDelaysMin: z.array(z.number().int().min(5).max(20160)).min(1).max(5).optional(),
  autoCloseAfterMin: z.number().int().min(60).max(129600).optional(),
  quietHoursStart: z.number().int().min(0).max(23).optional(),
  quietHoursEnd: z.number().int().min(0).max(23).optional(),
  timezone: z.string().trim().min(3).max(64).optional(),
  businessDaysOnly: z.boolean().optional(),
  slaFirstResponseMin: z.number().int().min(5).max(10080).optional(),
  followUpMode: z.enum(['ai', 'template']).optional(),
});

agentRouter.put(
  '/flow',
  ah(async (req, res) => {
    const accountId = req.account!.id;
    const data = flowSchema.parse(req.body);
    await prisma.flowPolicy.upsert({
      where: { accountId },
      update: data,
      create: { accountId, ...data },
    });

    // A mudança vale para as conversas EM ANDAMENTO, não só para as futuras -
    // é o que o lojista espera ao mexer no ajuste.
    const rescheduled = await rescheduleAccount(accountId);
    const row = await prisma.flowPolicy.findUnique({ where: { accountId } });
    res.json({ ...resolvePolicyRow(row), ticketsReprogramados: rescheduled });
  }),
);
