import type { Request } from 'express';
import type { CurrentUser } from '../modules/tickets/tickets.service';

/**
 * Monta o `CurrentUser` que os serviços de negócio recebem, combinando a
 * identidade (de `authenticate`) com o tenant (de `requireActiveAccount`).
 *
 * O `accountId` vem de `req.account`, e não de `req.user`, de propósito: o
 * guard de tenant RELÊ a conta do banco a cada requisição, então uma conta
 * suspensa ou expirada para de valer imediatamente, mesmo que o JWT emitido
 * antes ainda carregue o accountId antigo e continue dentro da validade.
 *
 * Falha ruidosamente se for usada numa rota sem os guards: é um erro de
 * montagem do router, e o silêncio aqui viraria consulta sem escopo de conta -
 * ou sem escopo de permissão.
 */
export function currentUser(req: Request): CurrentUser {
  if (!req.user) throw new Error('currentUser() exige o middleware authenticate');
  if (!req.account) throw new Error('currentUser() exige o middleware requireActiveAccount');
  if (!req.user.permissions) throw new Error('currentUser() exige o middleware loadPermissions');
  return {
    id: req.user.id,
    role: req.user.role,
    name: req.user.name,
    email: req.user.email,
    accountId: req.account.id,
    permissions: req.user.permissions,
  };
}
