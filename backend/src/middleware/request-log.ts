import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger';

/** Log de acesso: método, rota, status e duração. Nunca loga corpo (pode conter PII). */
export function requestLog(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info('http', {
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      ms: Math.round(ms),
      user: req.user?.id,
    });
  });
  next();
}
