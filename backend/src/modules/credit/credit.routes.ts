import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { ah } from '../../lib/errors';
import * as credit from './credit.service';

/** Módulo de Análise de Crédito — disponível a qualquer usuário autenticado (vendedor/gerente). */
export const creditRouter = Router();
creditRouter.use(authenticate);

const querySchema = z.object({ document: z.string().min(11, 'Informe um CPF ou CNPJ') });

creditRouter.post(
  '/queries',
  ah(async (req, res) => {
    const { document } = querySchema.parse(req.body);
    res.status(201).json(await credit.runQuery(document, req.user!));
  }),
);

creditRouter.get(
  '/queries/recent',
  ah(async (_req, res) => {
    res.json(await credit.recentQueries(5));
  }),
);

creditRouter.get(
  '/queries/:id',
  ah(async (req, res) => {
    res.json(await credit.getQuery(req.params.id));
  }),
);

const linkSchema = z.object({ leadId: z.string().min(1) });

creditRouter.post(
  '/queries/:id/link',
  ah(async (req, res) => {
    const { leadId } = linkSchema.parse(req.body);
    res.json(await credit.linkToLead(req.params.id, leadId, req.user!));
  }),
);
