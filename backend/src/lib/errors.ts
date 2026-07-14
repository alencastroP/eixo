import type { NextFunction, Request, RequestHandler, Response } from 'express';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message = 'Requisição inválida', code?: string) => new AppError(400, message, code);
export const unauthorized = (message = 'Não autenticado', code?: string) => new AppError(401, message, code);
export const forbidden = (message = 'Sem permissão para esta ação', code?: string) => new AppError(403, message, code);
export const notFound = (message = 'Recurso não encontrado', code?: string) => new AppError(404, message, code);
export const conflict = (message = 'Conflito', code?: string) => new AppError(409, message, code);

/** Express 4 não propaga rejeições de handlers async — este wrapper garante o next(err). */
export function ah(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
