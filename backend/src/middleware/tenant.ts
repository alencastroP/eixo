import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../lib/errors';
import { accessMessage, getAccount, isBlocked } from '../modules/billing/account.service';

/**
 * Guard de tenant: resolve a conta do usuário autenticado, injeta `req.account`
 * e BLOQUEIA o acesso se a conta estiver expirada/inadimplente/suspensa/cancelada.
 *
 * Deve rodar depois de `authenticate`. É o portão de acesso do SaaS — aplicado
 * às rotas de negócio (tickets, veículos, crédito, etc.). O status é sempre
 * relido do banco (não do JWT), então uma expiração via cron passa a valer na
 * requisição seguinte, mesmo com token ainda válido.
 *
 * No retrofit de isolamento por linha, `req.account.id` é a chave que a extensão
 * do Prisma Client usa para escopar automaticamente as queries por tenant.
 */
export async function requireActiveAccount(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (!req.user.accountId) return next(forbidden('Usuário sem conta associada', 'NO_ACCOUNT'));

  const account = await getAccount(req.user.accountId);
  if (!account) return next(forbidden('Conta não encontrada', 'NO_ACCOUNT'));
  if (isBlocked(account.status)) {
    return next(forbidden(accessMessage(account.status), 'ACCOUNT_BLOCKED'));
  }

  req.account = { id: account.id, status: account.status, trialEndsAt: account.trialEndsAt };
  return next();
}
