import { Router } from 'express';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { authenticate, requireRole } from '../../middleware/auth';
import { ah, conflict, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { hashPassword } from '../auth/auth.service';
import { writeAudit } from '../audit/audit.service';

export const usersRouter = Router();
usersRouter.use(authenticate);

const publicSelect = { id: true, name: true, email: true, role: true, active: true, createdAt: true } as const;

// Lista usada nos seletores de atribuição — ESCOPADA à conta do solicitante
// (isolamento multi-tenant: um admin nunca enxerga usuários de outra conta).
usersRouter.get(
  '/',
  ah(async (req, res) => {
    const users = await prisma.user.findMany({
      where: { accountId: req.user!.accountId },
      select: publicSelect,
      orderBy: { name: 'asc' },
    });
    res.json(users);
  }),
);

const createSchema = z.object({
  name: z.string().trim().min(2, 'Nome muito curto'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Senha deve ter ao menos 8 caracteres'),
  role: z.nativeEnum(UserRole).default(UserRole.AGENT),
});

usersRouter.post(
  '/',
  requireRole(UserRole.ADMIN),
  ah(async (req, res) => {
    const input = createSchema.parse(req.body);
    const email = input.email.toLowerCase();
    if (await prisma.user.findUnique({ where: { email } })) {
      throw conflict('Já existe um usuário com este e-mail');
    }
    const user = await prisma.user.create({
      // herda a conta de quem cria — isolamento multi-tenant
      data: { name: input.name, email, passwordHash: hashPassword(input.password), role: input.role, accountId: req.user!.accountId },
      select: publicSelect,
    });
    await writeAudit(prisma, {
      entityType: 'USER',
      entityId: user.id,
      action: 'CREATED',
      actorId: req.user!.id,
      data: { role: user.role },
    });
    res.status(201).json(user);
  }),
);

const updateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  role: z.nativeEnum(UserRole).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

usersRouter.patch(
  '/:id',
  requireRole(UserRole.ADMIN),
  ah(async (req, res) => {
    const input = updateSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    // bloqueia edição cross-tenant (IDOR entre contas via ID na URL)
    if (!existing || existing.accountId !== req.user!.accountId) throw notFound('Usuário não encontrado');

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        role: input.role,
        active: input.active,
        passwordHash: input.password ? hashPassword(input.password) : undefined,
      },
      select: publicSelect,
    });
    await writeAudit(prisma, {
      entityType: 'USER',
      entityId: user.id,
      action: 'UPDATED',
      actorId: req.user!.id,
      data: { fields: Object.keys(input).filter((k) => k !== 'password') },
    });
    res.json(user);
  }),
);
