import { Router } from 'express';
import { z } from 'zod';
import { FiscalKind, UserRole } from '@prisma/client';
import { authenticate, requireRole } from '../../middleware/auth';
import { ah } from '../../lib/errors';
import * as fiscal from './fiscal.service';

export const fiscalRouter = Router();
fiscalRouter.use(authenticate, requireRole(UserRole.ADMIN));

fiscalRouter.get(
  '/invoices',
  ah(async (req, res) => {
    const kind = req.query.kind ? (req.query.kind as FiscalKind) : undefined;
    res.json(await fiscal.listInvoices(kind));
  }),
);

fiscalRouter.get(
  '/invoices/:id',
  ah(async (req, res) => {
    res.json(await fiscal.getInvoice(req.params.id));
  }),
);

const emitSchema = z.object({
  kind: z.nativeEnum(FiscalKind),
  vehicleId: z.string().nullable().optional(),
  recipientName: z.string().trim().min(1, 'Informe o destinatário'),
  recipientDoc: z.string().trim().optional().nullable(),
  operationValue: z.coerce.number().positive('Valor da operação inválido'),
});

fiscalRouter.post(
  '/invoices',
  ah(async (req, res) => {
    res.status(201).json(await fiscal.emitInvoice(emitSchema.parse(req.body)));
  }),
);

fiscalRouter.post(
  '/invoices/:id/cancel',
  ah(async (req, res) => {
    res.json(await fiscal.cancelInvoice(req.params.id));
  }),
);
