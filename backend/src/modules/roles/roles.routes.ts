import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/permissions';
import { ah } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { writeAudit } from '../audit/audit.service';
import { PERMISSION_CATALOG, PROFILE_TEMPLATES } from './permissions';
import * as roles from './roles.service';

export const rolesRouter = Router();

/**
 * Catálogo de permissões. Serve para a tela desenhar os grupos e as caixas -
 * o front não mantém cópia da lista, senão um módulo novo apareceria no
 * back-end e sumiria da tela de perfis.
 */
rolesRouter.get(
  '/catalog',
  requirePermission('profiles.manage'),
  ah(async (_req, res) => {
    res.json({ groups: PERMISSION_CATALOG, templates: PROFILE_TEMPLATES });
  }),
);

// Também consumida pela tela de Usuários (para escolher o perfil de alguém).
rolesRouter.get(
  '/',
  requirePermission('profiles.manage', 'users.manage'),
  ah(async (req, res) => {
    res.json(await roles.listProfiles(req.account!.id));
  }),
);

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Nome muito curto').max(40, 'Nome muito longo'),
  description: z.string().trim().max(160).optional().or(z.literal('').transform(() => undefined)),
  permissions: z.array(z.string()).default([]),
});

rolesRouter.post(
  '/',
  requirePermission('profiles.manage'),
  ah(async (req, res) => {
    const input = profileSchema.parse(req.body);
    const profile = await roles.createProfile(req.account!.id, input);
    await writeAudit(prisma, {
      entityType: 'ACCESS_PROFILE',
      entityId: profile.id,
      action: 'CREATED',
      actorId: req.user!.id,
      data: { name: profile.name, permissions: profile.permissions.length },
    });
    res.status(201).json(profile);
  }),
);

rolesRouter.put(
  '/:id',
  requirePermission('profiles.manage'),
  ah(async (req, res) => {
    const input = profileSchema.parse(req.body);
    const profile = await roles.updateProfile(req.account!.id, req.params.id, input, req.user!.id);
    await writeAudit(prisma, {
      entityType: 'ACCESS_PROFILE',
      entityId: profile.id,
      action: 'UPDATED',
      actorId: req.user!.id,
      // a lista inteira entra na trilha: "quem ganhou o quê" é a pergunta que
      // se faz a uma auditoria de permissão
      data: { name: profile.name, permissions: profile.permissions },
    });
    res.json(profile);
  }),
);

rolesRouter.delete(
  '/:id',
  requirePermission('profiles.manage'),
  ah(async (req, res) => {
    await roles.deleteProfile(req.account!.id, req.params.id);
    await writeAudit(prisma, {
      entityType: 'ACCESS_PROFILE',
      entityId: req.params.id,
      action: 'DELETED',
      actorId: req.user!.id,
    });
    res.status(204).end();
  }),
);
