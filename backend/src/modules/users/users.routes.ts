import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/permissions';
import { ah, badRequest, conflict, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { hashPassword } from '../auth/auth.service';
import { writeAudit } from '../audit/audit.service';
import { assertCanAddUser } from '../billing/limits.service';
import { expandPermissions, roleFromPermissions } from '../roles/permissions';
import { ensureDefaultProfiles, invalidateAccess } from '../roles/roles.service';

export const usersRouter = Router();

const publicSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  profile: { select: { id: true, name: true } },
} as const;

// Lista usada nos seletores de atribuição - ESCOPADA à conta do solicitante
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

/**
 * Resolve o perfil pedido dentro da conta e devolve o nível base derivado.
 *
 * Sem `profileId`, cai no "Atendente" padrão: criar usuário sem dizer o que ele
 * pode fazer tem que resultar no acesso mais restrito, nunca no mais amplo.
 */
async function resolveProfile(accountId: string, profileId?: string) {
  if (!profileId) {
    const defaults = await ensureDefaultProfiles(prisma, accountId);
    const agent = defaults.get('agent')!;
    return { id: agent.id, role: roleFromPermissions(expandPermissions(agent.permissions)) };
  }
  const profile = await prisma.accessProfile.findUnique({ where: { id: profileId } });
  if (!profile || profile.accountId !== accountId) throw badRequest('Perfil de acesso inválido');
  return { id: profile.id, role: roleFromPermissions(expandPermissions(profile.permissions)) };
}

const createSchema = z.object({
  name: z.string().trim().min(2, 'Nome muito curto'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Senha deve ter ao menos 8 caracteres'),
  profileId: z.string().trim().min(1).optional(),
});

usersRouter.post(
  '/',
  requirePermission('users.manage'),
  ah(async (req, res) => {
    const input = createSchema.parse(req.body);
    const email = input.email.toLowerCase();
    if (await prisma.user.findUnique({ where: { email } })) {
      throw conflict('Já existe um usuário com este e-mail');
    }
    const accountId = req.user!.accountId!;
    await assertCanAddUser(accountId);
    const profile = await resolveProfile(accountId, input.profileId);

    const user = await prisma.user.create({
      // herda a conta de quem cria - isolamento multi-tenant
      data: {
        name: input.name,
        email,
        passwordHash: hashPassword(input.password),
        profileId: profile.id,
        role: profile.role,
        accountId,
      },
      select: publicSelect,
    });
    await writeAudit(prisma, {
      entityType: 'USER',
      entityId: user.id,
      action: 'CREATED',
      actorId: req.user!.id,
      data: { profile: user.profile?.name },
    });
    res.status(201).json(user);
  }),
);

const updateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  profileId: z.string().trim().min(1).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

/**
 * Impede a loja de ficar sem quem administre acesso.
 *
 * Sem esta trava, tirar a permissão do último administrador (ou revogá-lo)
 * deixaria a conta sem ninguém capaz de criar usuários ou perfis - e a única
 * saída seria abrir chamado no suporte para mexer no banco.
 */
async function assertNotLastAdmin(accountId: string, userId: string) {
  const others = await prisma.user.count({
    where: {
      accountId,
      active: true,
      id: { not: userId },
      OR: [
        { profile: { permissions: { hasSome: ['*', 'users.manage'] } } },
        // base antiga: quem ainda não tem perfil vale pelo nível herdado
        { profileId: null, role: 'ADMIN' },
      ],
    },
  });
  if (others === 0) {
    throw badRequest(
      'Esta é a última pessoa com permissão de gerenciar usuários. Dê o acesso a outra antes de alterar esta.',
    );
  }
}

usersRouter.patch(
  '/:id',
  requirePermission('users.manage'),
  ah(async (req, res) => {
    const input = updateSchema.parse(req.body);
    const accountId = req.user!.accountId!;
    const existing = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { profile: { select: { permissions: true } } },
    });
    // bloqueia edição cross-tenant (IDOR entre contas via ID na URL)
    if (!existing || existing.accountId !== accountId) throw notFound('Usuário não encontrado');

    // Reativar ocupa uma vaga do plano tanto quanto criar - o caminho mais
    // fácil de furar o limite seria desativar e reativar em sequência.
    if (input.active === true && !existing.active) await assertCanAddUser(accountId);

    const profile = input.profileId ? await resolveProfile(accountId, input.profileId) : null;

    const wasAdmin = existing.profile
      ? expandPermissions(existing.profile.permissions).includes('users.manage')
      : existing.role === 'ADMIN';
    const losesAdmin =
      (profile !== null && profile.role !== 'ADMIN') || input.active === false;
    if (wasAdmin && losesAdmin) await assertNotLastAdmin(accountId, existing.id);

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        active: input.active,
        profileId: profile?.id,
        // nível base sempre derivado do perfil - nunca editado à mão
        role: profile?.role,
        passwordHash: input.password ? hashPassword(input.password) : undefined,
      },
      select: publicSelect,
    });
    // o acesso muda agora, não no próximo refresh do token
    invalidateAccess(user.id);
    await writeAudit(prisma, {
      entityType: 'USER',
      entityId: user.id,
      action: 'UPDATED',
      actorId: req.user!.id,
      data: { fields: Object.keys(input).filter((k) => k !== 'password'), profile: user.profile?.name },
    });
    res.json(user);
  }),
);
