import { Router } from 'express';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { authenticate, requireRole } from '../../middleware/auth';
import { ah } from '../../lib/errors';
import * as settings from './settings.service';

export const settingsRouter = Router();
settingsRouter.use(authenticate);

// leitura liberada a autenticados (o formulário de leads precisa da config);
// escrita restrita a ADMIN.

settingsRouter.get(
  '/company',
  ah(async (_req, res) => res.json(await settings.getCompany())),
);

const companySchema = z.object({
  tradeName: z.string().trim().min(1, 'Informe o nome fantasia'),
  legalName: z.string().trim().default(''),
  cnpj: z.string().trim().default(''),
  email: z.string().trim().default(''),
  phone: z.string().trim().default(''),
  address: z.string().trim().default(''),
  city: z.string().trim().default(''),
  state: z.string().trim().default(''),
  logoUrl: z.string().nullable().default(null),
});

settingsRouter.put(
  '/company',
  requireRole(UserRole.ADMIN),
  ah(async (req, res) => res.json(await settings.setCompany(companySchema.parse(req.body)))),
);

settingsRouter.get(
  '/lead-form',
  ah(async (_req, res) => res.json(await settings.getLeadForm())),
);

const leadFormSchema = z.object({
  config: z.record(z.string(), z.object({ enabled: z.boolean(), required: z.boolean() })),
});

settingsRouter.put(
  '/lead-form',
  requireRole(UserRole.ADMIN),
  ah(async (req, res) => {
    const { config } = leadFormSchema.parse(req.body);
    res.json(await settings.setLeadForm(config as never));
  }),
);
