import { DispatchStatus, IntegrationStatus, Prisma, WebhookEventStatus } from '@prisma/client';
import { badRequest, notFound } from '../../lib/errors';
import { decryptJson, encryptJson, maskSecret, type SealedSecret } from '../../lib/crypto';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { listAdapters, findAdapter } from '../../integrations';
import type { PlatformCredentials } from '../../integrations';
import { writeAudit } from '../audit/audit.service';

/** Metadados de conexão (não sensíveis) que o front usa para montar card e modal. */
function adapterMeta(platform: string) {
  const adapter = findAdapter(platform);
  if (!adapter) return null;
  return {
    platform: adapter.platform,
    displayName: adapter.displayName,
    description: adapter.description ?? '',
    docsUrl: adapter.docsUrl ?? null,
    supportsOutbound: Boolean(adapter.supportsOutbound),
    canValidate: typeof adapter.validateCredentials === 'function',
    credentialFields: adapter.credentialFields ?? [],
  };
}

type IntegrationRow = Prisma.IntegrationGetPayload<Record<string, never>>;

/** Nunca devolve credenciais em claro — apenas a lista de campos preenchidos, mascarados. */
function maskedCredentials(row: IntegrationRow | null): Array<{ key: string; masked: string }> {
  const meta = row ? adapterMeta(row.platform) : null;
  if (!row || !row.credentials || !meta) return [];
  // as credenciais estão cifradas; a máscara é derivada apenas do que sabemos existir
  return meta.credentialFields
    .filter((f) => f.key)
    .map((f) => ({ key: f.key, masked: maskSecret(`${f.key}-set`) }));
}

function serialize(row: IntegrationRow | null, platform: string) {
  const meta = adapterMeta(platform)!;
  return {
    ...meta,
    status: row?.status ?? IntegrationStatus.AVAILABLE,
    syncEnabled: row?.syncEnabled ?? true,
    accountLabel: row?.accountLabel ?? null,
    connectedAt: row?.connectedAt ?? null,
    lastCheckedAt: row?.lastCheckedAt ?? null,
    lastError: row?.lastError ?? null,
    hasCredentials: Boolean(row?.credentials),
    maskedCredentials: maskedCredentials(row),
  };
}

/** Lista todas as plataformas registradas + o estado de conexão persistido. */
export async function listIntegrations() {
  const rows = await prisma.integration.findMany();
  const byPlatform = new Map(rows.map((r) => [r.platform, r]));
  return listAdapters().map((a) => serialize(byPlatform.get(a.platform) ?? null, a.platform));
}

/** Detalhe + "fluxo visualizado": saúde do webhook (inbound) e despachos (outbound). */
export async function getIntegration(platform: string) {
  const meta = adapterMeta(platform);
  if (!meta) throw notFound(`Plataforma não suportada: ${platform}`);
  const row = await prisma.integration.findUnique({ where: { platform } });

  const [inboundGroups, lastInbound, outboundGroups, recentDispatches] = await Promise.all([
    prisma.webhookEvent.groupBy({ by: ['status'], _count: true, where: { platform } }),
    prisma.webhookEvent.findFirst({ where: { platform }, orderBy: { receivedAt: 'desc' }, select: { receivedAt: true } }),
    row
      ? prisma.integrationDispatch.groupBy({ by: ['status'], _count: true, where: { platform } })
      : Promise.resolve([] as Array<{ status: DispatchStatus; _count: number }>),
    row
      ? prisma.integrationDispatch.findMany({
          where: { platform },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: { id: true, status: true, detail: true, externalRef: true, ticketId: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  const inbound = {
    received: inboundGroups.reduce((a, g) => a + g._count, 0),
    processed: inboundGroups.find((g) => g.status === WebhookEventStatus.PROCESSED)?._count ?? 0,
    failed: inboundGroups.find((g) => g.status === WebhookEventStatus.FAILED)?._count ?? 0,
    lastEventAt: lastInbound?.receivedAt ?? null,
  };
  const outbound = {
    sent: outboundGroups.find((g) => g.status === DispatchStatus.SENT)?._count ?? 0,
    failed: outboundGroups.find((g) => g.status === DispatchStatus.FAILED)?._count ?? 0,
    skipped: outboundGroups.find((g) => g.status === DispatchStatus.SKIPPED)?._count ?? 0,
    recent: recentDispatches,
  };

  return { ...serialize(row, platform), health: { inbound, outbound } };
}

async function upsertIntegration(platform: string, data: Prisma.IntegrationUncheckedUpdateInput) {
  return prisma.integration.upsert({
    where: { platform },
    update: data,
    create: { ...(data as Prisma.IntegrationUncheckedCreateInput), platform },
  });
}

/** Conecta a conta: valida as credenciais via adapter e as persiste CIFRADAS. */
export async function connectIntegration(platform: string, credentials: PlatformCredentials, actorId: string) {
  const adapter = findAdapter(platform);
  if (!adapter) throw notFound(`Plataforma não suportada: ${platform}`);

  // valida campos obrigatórios declarados pelo adapter
  for (const field of adapter.credentialFields ?? []) {
    if (field.required && !credentials[field.key]?.trim()) {
      throw badRequest(`Campo obrigatório ausente: ${field.label}`);
    }
  }

  const check = adapter.validateCredentials
    ? await adapter.validateCredentials(credentials)
    : { ok: true as const, accountLabel: adapter.displayName };

  if (!check.ok) {
    await upsertIntegration(platform, {
      status: IntegrationStatus.AUTH_ERROR,
      lastCheckedAt: new Date(),
      lastError: check.error ?? 'Credenciais rejeitadas',
    });
    await writeAudit(prisma, {
      entityType: 'USER',
      entityId: actorId,
      action: 'INTEGRATION_AUTH_FAILED',
      actorId,
      data: { platform },
    });
    throw badRequest(check.error ?? 'Falha na autenticação com a plataforma', 'INTEGRATION_AUTH');
  }

  await upsertIntegration(platform, {
    status: IntegrationStatus.CONNECTED,
    credentials: encryptJson(credentials) as unknown as Prisma.InputJsonValue,
    accountLabel: check.accountLabel ?? null,
    connectedAt: new Date(),
    lastCheckedAt: new Date(),
    lastError: null,
  });
  await writeAudit(prisma, {
    entityType: 'USER',
    entityId: actorId,
    action: 'INTEGRATION_CONNECTED',
    actorId,
    data: { platform, account: check.accountLabel },
  });
  logger.info('integração conectada', { platform, actor: actorId });
  return getIntegration(platform);
}

/** Revalida as credenciais salvas (botão "Testar conexão"). */
export async function testIntegration(platform: string) {
  const adapter = findAdapter(platform);
  if (!adapter) throw notFound(`Plataforma não suportada: ${platform}`);
  const row = await prisma.integration.findUnique({ where: { platform } });
  if (!row?.credentials) throw badRequest('Nenhuma credencial salva para testar');

  if (!adapter.validateCredentials) {
    await upsertIntegration(platform, { lastCheckedAt: new Date() });
    return getIntegration(platform);
  }

  const credentials = decryptJson<PlatformCredentials>(row.credentials as unknown as SealedSecret);
  const check = await adapter.validateCredentials(credentials);
  await upsertIntegration(platform, {
    status: check.ok ? IntegrationStatus.CONNECTED : IntegrationStatus.AUTH_ERROR,
    accountLabel: check.ok ? (check.accountLabel ?? row.accountLabel) : row.accountLabel,
    lastCheckedAt: new Date(),
    lastError: check.ok ? null : (check.error ?? 'Credenciais rejeitadas'),
  });
  return getIntegration(platform);
}

/** Liga/desliga a sincronização de mensagens sem remover a conexão. */
export async function setSync(platform: string, syncEnabled: boolean, actorId: string) {
  const row = await prisma.integration.findUnique({ where: { platform } });
  if (!row) throw badRequest('Conecte a conta antes de ajustar a sincronização');
  // não rebaixa AUTH_ERROR; alterna entre CONNECTED e DISABLED quando aplicável
  const status =
    row.status === IntegrationStatus.AUTH_ERROR
      ? row.status
      : syncEnabled
        ? IntegrationStatus.CONNECTED
        : IntegrationStatus.DISABLED;
  await prisma.integration.update({ where: { platform }, data: { syncEnabled, status } });
  await writeAudit(prisma, {
    entityType: 'USER',
    entityId: actorId,
    action: syncEnabled ? 'INTEGRATION_SYNC_ON' : 'INTEGRATION_SYNC_OFF',
    actorId,
    data: { platform },
  });
  return getIntegration(platform);
}

/** Desconecta: apaga as credenciais e volta o card ao estado "Disponível". */
export async function disconnectIntegration(platform: string, actorId: string) {
  const row = await prisma.integration.findUnique({ where: { platform } });
  if (!row) throw notFound('Integração não encontrada');
  await prisma.integration.update({
    where: { platform },
    data: {
      status: IntegrationStatus.AVAILABLE,
      credentials: Prisma.DbNull,
      accountLabel: null,
      connectedAt: null,
      lastError: null,
      syncEnabled: true,
    },
  });
  await writeAudit(prisma, {
    entityType: 'USER',
    entityId: actorId,
    action: 'INTEGRATION_DISCONNECTED',
    actorId,
    data: { platform },
  });
  logger.info('integração desconectada', { platform, actor: actorId });
  return getIntegration(platform);
}
