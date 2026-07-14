import type { UserRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      /** Usuário autenticado, injetado pelo middleware authenticate. */
      user?: { id: string; role: UserRole; name: string; email: string; accountId: string | null };
      /** Conta ativa resolvida pelo guard requireActiveAccount. */
      account?: { id: string; status: string; trialEndsAt: Date | null };
      /** Corpo bruto da requisição — necessário para verificação HMAC de webhooks. */
      rawBody?: Buffer;
    }
  }
}

export {};
