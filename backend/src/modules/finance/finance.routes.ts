import { Router } from 'express';
import { z } from 'zod';
import { FinancialType, UserRole } from '@prisma/client';
import { authenticate, requireRole } from '../../middleware/auth';
import { ah } from '../../lib/errors';
import * as finance from './finance.service';

/** Módulo Administrativo & Fiscal — restrito a ADMIN (gestor/lojista). */
export const financeRouter = Router();
financeRouter.use(authenticate, requireRole(UserRole.ADMIN));

const listSchema = z.object({
  type: z.nativeEnum(FinancialType).optional(),
  status: z.enum(['PENDING', 'PAID', 'OVERDUE']).optional(),
  category: z.string().trim().min(1).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

financeRouter.get(
  '/entries',
  ah(async (req, res) => {
    res.json(await finance.listEntries(listSchema.parse(req.query)));
  }),
);

financeRouter.get(
  '/summary',
  ah(async (_req, res) => {
    res.json(await finance.summary());
  }),
);

const createSchema = z.object({
  type: z.nativeEnum(FinancialType),
  category: z.string().trim().min(1, 'Informe a categoria'),
  description: z.string().trim().min(1, 'Informe a descrição'),
  amount: z.coerce.number().positive('Valor deve ser maior que zero'),
  dueDate: z.string().min(4, 'Informe o vencimento'),
  vehicleId: z.string().nullable().optional(),
  paid: z.boolean().optional(),
});

financeRouter.post(
  '/entries',
  ah(async (req, res) => {
    res.status(201).json(await finance.createEntry(createSchema.parse(req.body)));
  }),
);

const paidSchema = z.object({ paid: z.boolean() });

financeRouter.patch(
  '/entries/:id/paid',
  ah(async (req, res) => {
    const { paid } = paidSchema.parse(req.body);
    res.json(await finance.setPaid(req.params.id, paid));
  }),
);

financeRouter.delete(
  '/entries/:id',
  ah(async (req, res) => {
    await finance.deleteEntry(req.params.id);
    res.status(204).end();
  }),
);
