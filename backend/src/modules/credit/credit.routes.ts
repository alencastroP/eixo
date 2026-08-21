import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/permissions';
import { currentUser } from '../../lib/current-user';
import { ah } from '../../lib/errors';
import * as credit from './credit.service';

/** Módulo de Análise de Crédito. Ler o histórico e disparar consulta nova são
 *  permissões distintas: consulta a bureau tem custo e deixa rastro. */
export const creditRouter = Router();
creditRouter.use(requirePermission('credit.view'));

// leadId + consentConfirmed são obrigatórios: uma consulta sem titular
// identificado não tem como provar autorização (ver credit.service.ts).
const querySchema = z.object({
  document: z.string().min(11, 'Informe um CPF ou CNPJ'),
  leadId: z.string().min(1, 'Selecione o lead/cliente desta consulta'),
  consentConfirmed: z.boolean(),
  consentSource: z.string().min(1, 'Informe o canal da autorização'),
});

creditRouter.post(
  '/queries',
  requirePermission('credit.query'),
  ah(async (req, res) => {
    const { document, leadId, consentConfirmed, consentSource } = querySchema.parse(req.body);
    const result = await credit.runQuery(document, currentUser(req), { leadId, consentConfirmed, consentSource });
    res.status(201).json(result);
  }),
);

creditRouter.get(
  '/queries/recent',
  ah(async (req, res) => {
    res.json(await credit.recentQueries(currentUser(req).accountId, 5));
  }),
);

creditRouter.get(
  '/queries/:id',
  ah(async (req, res) => {
    res.json(await credit.getQuery(req.params.id, currentUser(req).accountId));
  }),
);

const linkSchema = z.object({ leadId: z.string().min(1) });

creditRouter.post(
  '/queries/:id/link',
  requirePermission('credit.query'),
  ah(async (req, res) => {
    const { leadId } = linkSchema.parse(req.body);
    res.json(await credit.linkToLead(req.params.id, leadId, currentUser(req)));
  }),
);
