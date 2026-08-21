import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env';
import { forbidden, unauthorized } from '../../lib/errors';

/**
 * Portão do módulo de Plataforma: só passa quem pertence à ÚNICA conta
 * configurada em `PLATFORM_ACCOUNT_ID`.
 *
 * Roda logo depois de `authenticate`, ANTES de `loadPermissions`/`requirePermission`
 * - de propósito. A barreira aqui é de CONTA, não de perfil: mesmo que o perfil
 * "Administrador" de uma loja qualquer viesse a incluir os slugs `platform.*`
 * (bug, erro de cadastro, o que for), esta checagem já barra antes de a lista
 * de permissões entrar em jogo. Sem `PLATFORM_ACCOUNT_ID` configurado, o
 * módulo inteiro fica fechado para todo mundo - inclusive para quem seria o
 * super-admin.
 */
export function requirePlatformAccount(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (!env.platformAccountId || req.user.accountId !== env.platformAccountId) {
    return next(forbidden('Este módulo é restrito à conta operadora do Eixo', 'NOT_PLATFORM_ACCOUNT'));
  }
  return next();
}
