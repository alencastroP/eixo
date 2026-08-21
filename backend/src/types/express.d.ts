import type { UserRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      /**
       * Usuário autenticado, injetado pelo middleware authenticate.
       * `permissions`/`profile*` chegam depois, por loadPermissions - quem
       * decide acesso é a lista de permissões, não o `role`.
       */
      user?: {
        id: string;
        role: UserRole;
        name: string;
        email: string;
        accountId: string | null;
        profileId?: string | null;
        profileName?: string | null;
        permissions?: string[];
      };
      /** Conta ativa resolvida pelo guard requireActiveAccount. */
      account?: { id: string; status: string; trialEndsAt: Date | null };
      /** Corpo bruto da requisição - necessário para verificação HMAC de webhooks. */
      rawBody?: Buffer;
    }
  }
}

export {};
