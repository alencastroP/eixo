import { Router } from 'express';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { authenticate, requireRole } from '../../middleware/auth';
import { ah } from '../../lib/errors';
import * as integrations from './integrations.service';

/** Módulo de Integrações — administração (apenas ADMIN). */
export const integrationsRouter = Router();
integrationsRouter.use(authenticate, requireRole(UserRole.ADMIN));

integrationsRouter.get(
  '/',
  ah(async (_req, res) => {
    res.json(await integrations.listIntegrations());
  }),
);

integrationsRouter.get(
  '/:platform',
  ah(async (req, res) => {
    res.json(await integrations.getIntegration(req.params.platform.toLowerCase()));
  }),
);

// credenciais: mapa dinâmico string→string (os campos vêm do adapter)
const connectSchema = z.object({
  credentials: z.record(z.string(), z.string()),
});

integrationsRouter.post(
  '/:platform/connect',
  ah(async (req, res) => {
    const { credentials } = connectSchema.parse(req.body);
    res.json(await integrations.connectIntegration(req.params.platform.toLowerCase(), credentials, req.user!.id));
  }),
);

integrationsRouter.post(
  '/:platform/test',
  ah(async (req, res) => {
    res.json(await integrations.testIntegration(req.params.platform.toLowerCase()));
  }),
);

const syncSchema = z.object({ syncEnabled: z.boolean() });

integrationsRouter.patch(
  '/:platform/sync',
  ah(async (req, res) => {
    const { syncEnabled } = syncSchema.parse(req.body);
    res.json(await integrations.setSync(req.params.platform.toLowerCase(), syncEnabled, req.user!.id));
  }),
);

integrationsRouter.post(
  '/:platform/disconnect',
  ah(async (req, res) => {
    res.json(await integrations.disconnectIntegration(req.params.platform.toLowerCase(), req.user!.id));
  }),
);
