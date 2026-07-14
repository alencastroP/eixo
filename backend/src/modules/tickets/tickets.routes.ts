import { Router } from 'express';
import { z } from 'zod';
import { TicketPriority, TicketStatus } from '@prisma/client';
import { authenticate } from '../../middleware/auth';
import { ah } from '../../lib/errors';
import * as tickets from './tickets.service';

export const ticketsRouter = Router();
ticketsRouter.use(authenticate);

const listQuerySchema = z.object({
  status: z.nativeEnum(TicketStatus).optional(),
  platform: z.string().trim().min(1).optional(),
  assignedTo: z.string().trim().min(1).optional(), // 'me' | 'unassigned' | userId
  search: z.string().trim().min(1).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD').optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD').optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

ticketsRouter.get(
  '/',
  ah(async (req, res) => {
    const params = listQuerySchema.parse(req.query);
    res.json(await tickets.listTickets(params, req.user!));
  }),
);

ticketsRouter.get(
  '/stats',
  ah(async (req, res) => {
    res.json(await tickets.ticketStats(req.user!));
  }),
);

const metricsQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(365).default(30),
});

ticketsRouter.get(
  '/metrics',
  ah(async (req, res) => {
    const { windowDays } = metricsQuerySchema.parse(req.query);
    res.json(await tickets.ticketMetrics(req.user!, windowDays));
  }),
);

const createSchema = z.object({
  lead: z.object({
    name: z.string().trim().min(2, 'Informe o nome do interessado'),
    phone: z.string().trim().optional(),
    email: z.string().email('E-mail inválido').optional().or(z.literal('').transform(() => undefined)),
    document: z.string().trim().optional(),
  }),
  message: z.string().trim().min(1, 'Registre a mensagem/motivo do contato'),
  vehicleText: z.string().trim().max(200).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  extra: z.record(z.string(), z.string()).optional(),
});

ticketsRouter.post(
  '/',
  ah(async (req, res) => {
    const input = createSchema.parse(req.body);
    res.status(201).json(await tickets.createManualTicket(input, req.user!));
  }),
);

ticketsRouter.get(
  '/:id',
  ah(async (req, res) => {
    res.json(await tickets.getTicket(req.params.id, req.user!));
  }),
);

const updateSchema = z
  .object({
    status: z.nativeEnum(TicketStatus).optional(),
    priority: z.nativeEnum(TicketPriority).optional(),
    assignedToId: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nenhum campo para atualizar' });

ticketsRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const patch = updateSchema.parse(req.body);
    res.json(await tickets.updateTicket(req.params.id, patch, req.user!));
  }),
);

const botSchema = z.object({ enabled: z.boolean() });

ticketsRouter.patch(
  '/:id/bot',
  ah(async (req, res) => {
    const { enabled } = botSchema.parse(req.body);
    res.json(await tickets.setBotEnabled(req.params.id, enabled, req.user!));
  }),
);

const interactionSchema = z.object({
  type: z.enum(['AGENT_REPLY', 'INTERNAL_NOTE']),
  body: z.string().trim().min(1, 'Mensagem vazia'),
});

ticketsRouter.post(
  '/:id/interactions',
  ah(async (req, res) => {
    const input = interactionSchema.parse(req.body);
    res.status(201).json(await tickets.addInteraction(req.params.id, input, req.user!));
  }),
);
