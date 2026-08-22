import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { authRateLimit } from '../../middleware/security';
import { env } from '../../config/env';
import { ah, unauthorized } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { serializeAccount } from '../billing/account.service';
import { resolveUserAccess } from '../roles/roles.service';
import * as authService from './auth.service';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

const forgotPasswordSchema = z.object({ email: z.string().email('E-mail inválido') });

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'A nova senha precisa de ao menos 8 caracteres'),
});

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

// Sempre 204, exista ou não o e-mail - ver comentário anti-enumeração no service.
authRouter.post(
  '/forgot-password',
  authRateLimit,
  ah(async (req, res) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    await authService.requestPasswordReset(email);
    res.status(204).end();
  }),
);

authRouter.post(
  '/reset-password',
  authRateLimit,
  ah(async (req, res) => {
    const { token, password } = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(token, password);
    res.status(204).end();
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

/**
 * Sessão do usuário. Além da identidade e da conta, devolve o PERFIL e a lista
 * efetiva de permissões - é com ela que o front acende ou apaga menus, rotas e
 * botões. A lista chega expandida (coringa e implicações já resolvidos), então
 * a checagem no cliente é uma busca simples na lista.
 *
 * Isso não é controle de acesso: é a mesma decisão que o servidor já toma,
 * antecipada para a tela não oferecer o que ela sabe que vai levar 403.
 */
authRouter.get(
  '/me',
  authenticate,
  ah(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, include: { account: true } });
    if (!user || !user.active) throw unauthorized('Usuário inativo ou removido');
    const access = await resolveUserAccess(user.id);
    res.json({
      ...authService.toPublicUser(user),
      profile: access.profileId ? { id: access.profileId, name: access.profileName } : null,
      permissions: access.permissions,
      account: user.account ? serializeAccount(user.account) : null,
      // Booleano rígido, independente do perfil/permissões: só true para quem
      // pertence à ÚNICA conta configurada em PLATFORM_ACCOUNT_ID.
      isPlatformAdmin: Boolean(env.platformAccountId) && user.accountId === env.platformAccountId,
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

// Edição do próprio perfil ("Meus Dados") - troca de senha exige a senha atual.
authRouter.patch(
  '/me',
  authenticate,
  ah(async (req, res) => {
    const input = updateMeSchema.parse(req.body);
    res.json(await authService.updateOwnProfile(req.user!.id, input));
  }),
);
