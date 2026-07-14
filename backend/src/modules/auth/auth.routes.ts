import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { authRateLimit } from '../../middleware/security';
import { ah, unauthorized } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { serializeAccount } from '../billing/account.service';
import * as authService from './auth.service';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

authRouter.post(
  '/login',
  authRateLimit,
  ah(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    res.json(await authService.login(email, password));
  }),
);

authRouter.post(
  '/refresh',
  authRateLimit,
  ah(async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    res.json(await authService.refresh(refreshToken));
  }),
);

authRouter.post(
  '/logout',
  ah(async (req, res) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (parsed.success) await authService.logout(parsed.data.refreshToken);
    res.status(204).end();
  }),
);

authRouter.get(
  '/me',
  authenticate,
  ah(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, include: { account: true } });
    if (!user || !user.active) throw unauthorized('Usuário inativo ou removido');
    res.json({
      ...authService.toPublicUser(user),
      account: user.account ? serializeAccount(user.account) : null,
    });
  }),
);

const updateMeSchema = z
  .object({
    name: z.string().trim().min(2, 'Nome muito curto').optional(),
    email: z.string().email('E-mail inválido').optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8, 'A nova senha precisa de ao menos 8 caracteres').optional(),
  })
  .refine((v) => !v.newPassword || v.currentPassword, {
    message: 'Informe a senha atual para trocar a senha',
    path: ['currentPassword'],
  });

// Edição do próprio perfil ("Meus Dados") — troca de senha exige a senha atual.
authRouter.patch(
  '/me',
  authenticate,
  ah(async (req, res) => {
    const input = updateMeSchema.parse(req.body);
    res.json(await authService.updateOwnProfile(req.user!.id, input));
  }),
);
