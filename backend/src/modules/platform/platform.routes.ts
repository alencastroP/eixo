import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/permissions';
import { ah } from '../../lib/errors';
import * as platformService from './platform.service';

export const platformRouter = Router();

platformRouter.get(
  '/accounts',
  requirePermission('platform.accounts.view'),
  ah(async (_req, res) => {
    res.json(await platformService.listAccountsOverview());
  }),
);

platformRouter.get(
  '/accounts/:id',
  requirePermission('platform.accounts.view'),
  ah(async (req, res) => {
    res.json(await platformService.accountDetail(req.params.id));
  }),
);

platformRouter.get(
  '/support-sessions',
  requirePermission('platform.accounts.view'),
  ah(async (_req, res) => {
    res.json(await platformService.listActiveSupportSessions());
  }),
);

const startSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  durationMinutes: z.number().int().min(15).max(240).optional(),
});

platformRouter.post(
  '/accounts/:id/support-sessions',
  requirePermission('platform.support.access'),
  ah(async (req, res) => {
    const input = startSchema.parse(req.body);
    const result = await platformService.startSupportSession({
      accountId: req.params.id,
      requestedById: req.user!.id,
      reason: input.reason,
      durationMinutes: input.durationMinutes,
    });
    res.status(201).json(result);
  }),
);

platformRouter.post(
  '/support-sessions/:id/end',
  requirePermission('platform.support.access'),
  ah(async (req, res) => {
    await platformService.endSupportSession(req.params.id, req.user!.id, 'REVOKED');
    res.status(204).end();
  }),
);
