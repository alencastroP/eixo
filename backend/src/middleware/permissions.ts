import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../lib/errors';
import { hasPermission } from '../modules/roles/permissions';
import { resolveUserAccess } from '../modules/roles/roles.service';

/**
 * Injeta em `req.user` o perfil de acesso e a lista efetiva de permissões.
 *
 * Roda depois de `authenticate` e ANTES de qualquer `requirePermission`. A
 * lista vem do banco (com cache curto), e não do JWT, de propósito: revogar
 * uma permissão precisa valer agora, não no próximo refresh do token.
 */
export async function loadPermissions(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  try {
    const access = await resolveUserAccess(req.user.id);
    req.user.profileId = access.profileId;
    req.user.profileName = access.profileName;
    req.user.permissions = access.permissions;
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Barra a rota quando o usuário não tem NENHUMA das permissões pedidas.
 *
 * Vários slugs significam "qualquer um destes serve" - a busca de leads, por
 * exemplo, atende tanto quem trabalha o funil quanto quem roda crédito.
 */
export function requirePermission(...required: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    // Falha ruidosa: sem a lista carregada, qualquer checagem passaria batido.
    if (!req.user.permissions) {
      return next(new Error('requirePermission() exige o middleware loadPermissions'));
    }
    if (!hasPermission(req.user.permissions, ...required)) {
      return next(forbidden('Seu perfil de acesso não permite esta ação', 'FORBIDDEN'));
    }
    return next();
  };
}
