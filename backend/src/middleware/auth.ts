import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';
import { env } from '../config/env';
import { unauthorized } from '../lib/errors';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  name: string;
  email: string;
  accountId?: string | null;
}

/**
 * Verifica o JWT e popula `req.user` com a identidade. NÃO decide acesso:
 * quem pode o quê vem do perfil, resolvido em `middleware/permissions`.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return next(unauthorized());

  try {
    // algoritmo fixado: impede downgrade/confusão de algoritmo (ex.: "alg":"none")
    const payload = jwt.verify(header.slice('Bearer '.length), env.jwt.accessSecret, {
      algorithms: ['HS256'],
    }) as AccessTokenPayload;
    req.user = {
      id: payload.sub,
      role: payload.role,
      name: payload.name,
      email: payload.email,
      accountId: payload.accountId ?? null,
    };
    return next();
  } catch {
    return next(unauthorized('Sessão expirada ou token inválido', 'TOKEN_INVALID'));
  }
}
