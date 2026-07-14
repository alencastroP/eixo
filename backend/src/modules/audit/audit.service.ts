import type { Prisma } from '@prisma/client';

type Db = Prisma.TransactionClient;

export interface AuditEntry {
  entityType: 'TICKET' | 'LEAD' | 'USER';
  entityId: string;
  action: string;
  actorId?: string | null;
  data?: Record<string, unknown>;
}

/** Grava um registro de auditoria. Aceita o client normal ou um transaction client. */
export async function writeAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      actorId: entry.actorId ?? null,
      data: (entry.data ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
