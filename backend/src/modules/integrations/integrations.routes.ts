import { Router } from 'express';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { authenticate, requireRole } from '../../middleware/auth';
import { ah } from '../../lib/errors';
import * as integrations from './integrations.service';

/**
 * Módulo de Integrações - administração da PRÓPRIA conta (apenas ADMIN).
 *
 * `req.account!.id` é sempre a fonte do tenant; a conta nunca vem do corpo nem
 * da query, então um admin não consegue operar a integração de outra loja
 * trocando um parâmetro.
 */
export const integrationsRouter = Router();
integrationsRouter.use(authenticate, requireRole(UserRole.ADMIN));

integrationsRouter.get(
  '/',
  ah(async (req, res) => {
    res.json(await integrations.listIntegrations(req.account!.id));
  }),
);

integrationsRouter.get(
  '/:platform',
  ah(async (req, res) => {
    res.json(await integrations.getIntegration(req.account!.id, req.params.platform.toLowerCase()));
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
    res.json(
      await integrations.connectIntegration(
        req.account!.id,
        req.params.platform.toLowerCase(),
        credentials,
        req.user!.id,
      ),
    );
  }),
);

integrationsRouter.post(
  '/:platform/test',
  ah(async (req, res) => {
    res.json(await integrations.testIntegration(req.account!.id, req.params.platform.toLowerCase()));
  }),
);

const syncSchema = z.object({ syncEnabled: z.boolean() });

integrationsRouter.patch(
  '/:platform/sync',
  ah(async (req, res) => {
    const { syncEnabled } = syncSchema.parse(req.body);
    res.json(
      await integrations.setSync(req.account!.id, req.params.platform.toLowerCase(), syncEnabled, req.user!.id),
    );
  }),
);

integrationsRouter.post(
  '/:platform/disconnect',
  ah(async (req, res) => {
    res.json(
      await integrations.disconnectIntegration(req.account!.id, req.params.platform.toLowerCase(), req.user!.id),
    );
  }),
);

/**
 * Revela UMA VEZ o segredo de webhook desta loja, para o lojista colar no
 * painel da plataforma. Rota separada (e POST, não GET) de propósito: o valor
 * não trafega no carregamento normal da tela, não entra em log de acesso de
 * query string e não fica em cache de navegador.
 */
integrationsRouter.post(
  '/:platform/reveal-secret',
  ah(async (req, res) => {
    res.json(await integrations.revealInboundSecret(req.account!.id, req.params.platform.toLowerCase(), req.user!.id));
  }),
);

/** Gera um novo segredo (o anterior para de valer imediatamente). */
integrationsRouter.post(
  '/:platform/rotate-secret',
  ah(async (req, res) => {
    res.json(await integrations.rotateInboundSecret(req.account!.id, req.params.platform.toLowerCase(), req.user!.id));
  }),
);
