import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { message: 'Rota não encontrada' } });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { message: err.message, code: err.code } });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: 'Dados inválidos',
        code: 'VALIDATION',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  logger.error('erro não tratado', {
    method: req.method,
    path: req.path,
    err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack?.split('\n').slice(0, 5) } : String(err),
  });
  return res.status(500).json({ error: { message: 'Erro interno do servidor' } });
}
