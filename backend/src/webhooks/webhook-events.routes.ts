import { Router } from 'express';
import { z } from 'zod';
import { UserRole, WebhookEventStatus } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth';
import { ah, badRequest, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';

/** Rotas administrativas (na API principal) para observar e reprocessar a fila de webhooks. */
export const webhookEventsRouter = Router();
webhookEventsRouter.use(authenticate, requireRole(UserRole.ADMIN));

const listSchema = z.object({
  status: z.nativeEnum(WebhookEventStatus).optional(),
  platform: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

webhookEventsRouter.get(
  '/',
  ah(async (req, res) => {
    const q = listSchema.parse(req.query);
    const where = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.platform ? { platform: q.platform } : {}),
    };
    const [total, items] = await prisma.$transaction([
      prisma.webhookEvent.count({ where }),
      prisma.webhookEvent.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

webhookEventsRouter.post(
  '/:id/retry',
  ah(async (req, res) => {
    const event = await prisma.webhookEvent.findUnique({ where: { id: req.params.id } });
    if (!event) throw notFound('Evento não encontrado');
    if (event.status !== WebhookEventStatus.FAILED) {
      throw badRequest('Apenas eventos com falha podem ser reprocessados');
    }
    const updated = await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: WebhookEventStatus.RECEIVED, nextAttemptAt: null, lastError: null },
    });
    res.json(updated);
  }),
);
