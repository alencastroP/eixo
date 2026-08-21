import { DispatchStatus, IntegrationStatus, Prisma, WebhookEventStatus } from '@prisma/client';
import { env } from '../../config/env';
import { badRequest, notFound } from '../../lib/errors';
import { decryptJson, encryptJson, isSealedSecret, maskSecret, type SealedSecret } from '../../lib/crypto';
import { buildWebhookUrl, generateInboundSecret, generateWebhookKey } from '../../lib/webhook-key';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { listAdapters, findAdapter } from '../../integrations';
import type { PlatformCredentials } from '../../integrations';
import { writeAudit } from '../audit/audit.service';

/**
 * Toda função deste módulo recebe `accountId` como primeiro parâmetro: as
 * integrações passaram a ser por lojista (uma linha por conta+plataforma), e
 * não mais uma configuração global da instalação.
 */
type Sealed = Prisma.InputJsonValue;

/**
 * Header em que cada plataforma envia o segredo. Exibido na tela junto da URL,
 * para o lojista saber exatamente onde colar o valor no painel dela.
 */
const INBOUND_HEADER: Record<string, string> = {
  olx: 'x-olx-token',
  mercadolivre: 'x-signature (HMAC-SHA256 do corpo)',
  webmotors: 'x-webmotors-token',
  // O WhatsApp é o único que não recebe o segredo em header: a Meta o pede uma
  // vez, no campo "Verify token" da configuração do webhook, e a partir daí
  // assina os eventos com o App Secret (que é credencial, não este segredo).
  whatsapp: 'campo "Token de verificação" no painel da Meta',
};

/** Envelope cifrado do segredo de webhook daquela conta. */
const sealSecret = (value: string) => encryptJson({ value }) as unknown as Sealed;

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
    supportsUserChannels: Boolean(adapter.supportsUserChannels),
    canValidate: typeof adapter.validateCredentials === 'function',
    credentialFields: adapter.credentialFields ?? [],
  };
}

type IntegrationRow = Prisma.IntegrationGetPayload<Record<string, never>>;

/** Nunca devolve credenciais em claro - apenas a lista de campos preenchidos, mascarados. */
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
    // URL exclusiva desta loja, para colar no painel da plataforma. Não é
    // segredo (só roteia), então pode ser exibida à vontade na tela.
    webhookUrl: row ? buildWebhookUrl(env.webhookPublicUrl, platform, row.webhookKey) : null,
    hasInboundSecret: Boolean(row?.inboundSecret),
  };
}

/** Plataformas registradas + o estado de conexão DESTA conta. */
export async function listIntegrations(accountId: string) {
  const rows = await prisma.integration.findMany({ where: { accountId } });
  const byPlatform = new Map(rows.map((r) => [r.platform, r]));
  return listAdapters().map((a) => serialize(byPlatform.get(a.platform) ?? null, a.platform));
}

/** Detalhe + "fluxo visualizado": saúde do webhook (inbound) e despachos (outbound). */
export async function getIntegration(accountId: string, platform: string) {
  const meta = adapterMeta(platform);
  if (!meta) throw notFound(`Plataforma não suportada: ${platform}`);
  const row = await prisma.integration.findUnique({
    where: { accountId_platform: { accountId, platform } },
  });

  // Toda a telemetria é filtrada pela conta: o volume de leads de uma loja é
  // informação comercial dela, não do vizinho que usa a mesma instalação.
  const [inboundGroups, lastInbound, outboundGroups, recentDispatches] = await Promise.all([
    prisma.webhookEvent.groupBy({ by: ['status'], _count: true, where: { platform, accountId } }),
    prisma.webhookEvent.findFirst({
      where: { platform, accountId },
      orderBy: { receivedAt: 'desc' },
      select: { receivedAt: true },
    }),
    row
      ? prisma.integrationDispatch.groupBy({
          by: ['status'],
          _count: true,
          where: { platform, integrationId: row.id },
        })
      : Promise.resolve([] as Array<{ status: DispatchStatus; _count: number }>),
    row
      ? prisma.integrationDispatch.findMany({
          where: { platform, integrationId: row.id },
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

/**
 * Upsert por (conta, plataforma). Na criação, gera de uma vez a chave de
 * roteamento e o segredo de webhook desta loja - assim a integração já nasce
 * com endpoint próprio, sem depender de variável de ambiente compartilhada.
 */
async function upsertIntegration(
  accountId: string,
  platform: string,
  data: Prisma.IntegrationUncheckedUpdateInput,
) {
  return prisma.integration.upsert({
    where: { accountId_platform: { accountId, platform } },
    update: data,
    create: {
      ...(data as Prisma.IntegrationUncheckedCreateInput),
      platform,
      accountId,
      webhookKey: generateWebhookKey(),
      inboundSecret: sealSecret(generateInboundSecret()),
    },
  });
}

/** Conecta a conta: valida as credenciais via adapter e as persiste CIFRADAS. */
export async function connectIntegration(
  accountId: string,
  platform: string,
  credentials: PlatformCredentials,
  actorId: string,
) {
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
    await upsertIntegration(accountId, platform, {
      status: IntegrationStatus.AUTH_ERROR,
      lastCheckedAt: new Date(),
      lastError: check.error ?? 'Credenciais rejeitadas',
    });
    await writeAudit(prisma, {
      entityType: 'USER',
      entityId: actorId,
      action: 'INTEGRATION_AUTH_FAILED',
      actorId,
      data: { platform, accountId },
    });
    throw badRequest(check.error ?? 'Falha na autenticação com a plataforma', 'INTEGRATION_AUTH');
  }

  await upsertIntegration(accountId, platform, {
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
    data: { platform, accountId, account: check.accountLabel },
  });
  logger.info('integração conectada', { platform, accountId, actor: actorId });
  return getIntegration(accountId, platform);
}

/** Revalida as credenciais salvas (botão "Testar conexão"). */
export async function testIntegration(accountId: string, platform: string) {
  const adapter = findAdapter(platform);
  if (!adapter) throw notFound(`Plataforma não suportada: ${platform}`);
  const row = await prisma.integration.findUnique({ where: { accountId_platform: { accountId, platform } } });
  if (!row?.credentials) throw badRequest('Nenhuma credencial salva para testar');

  if (!adapter.validateCredentials) {
    await upsertIntegration(accountId, platform, { lastCheckedAt: new Date() });
    return getIntegration(accountId, platform);
  }

  const credentials = decryptJson<PlatformCredentials>(row.credentials as unknown as SealedSecret);
  const check = await adapter.validateCredentials(credentials);
  await upsertIntegration(accountId, platform, {
    status: check.ok ? IntegrationStatus.CONNECTED : IntegrationStatus.AUTH_ERROR,
    accountLabel: check.ok ? (check.accountLabel ?? row.accountLabel) : row.accountLabel,
    lastCheckedAt: new Date(),
    lastError: check.ok ? null : (check.error ?? 'Credenciais rejeitadas'),
  });
  return getIntegration(accountId, platform);
}

/** Liga/desliga a sincronização de mensagens sem remover a conexão. */
export async function setSync(accountId: string, platform: string, syncEnabled: boolean, actorId: string) {
  const row = await prisma.integration.findUnique({ where: { accountId_platform: { accountId, platform } } });
  if (!row) throw badRequest('Conecte a conta antes de ajustar a sincronização');
  // não rebaixa AUTH_ERROR; alterna entre CONNECTED e DISABLED quando aplicável
  const status =
    row.status === IntegrationStatus.AUTH_ERROR
      ? row.status
      : syncEnabled
        ? IntegrationStatus.CONNECTED
        : IntegrationStatus.DISABLED;
  await prisma.integration.update({ where: { accountId_platform: { accountId, platform } }, data: { syncEnabled, status } });
  await writeAudit(prisma, {
    entityType: 'USER',
    entityId: actorId,
    action: syncEnabled ? 'INTEGRATION_SYNC_ON' : 'INTEGRATION_SYNC_OFF',
    actorId,
    data: { platform, accountId },
  });
  return getIntegration(accountId, platform);
}

/** Desconecta: apaga as credenciais e volta o card ao estado "Disponível". */
export async function disconnectIntegration(accountId: string, platform: string, actorId: string) {
  const row = await prisma.integration.findUnique({ where: { accountId_platform: { accountId, platform } } });
  if (!row) throw notFound('Integração não encontrada');
  await prisma.integration.update({
    where: { accountId_platform: { accountId, platform } },
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
    data: { platform, accountId },
  });
  logger.info('integração desconectada', { platform, accountId, actor: actorId });
  return getIntegration(accountId, platform);
}

/**
 * Revela o segredo de webhook em claro, para o lojista configurar o painel da
 * plataforma. Auditado: é a única porta pela qual o valor sai do sistema.
 */
export async function revealInboundSecret(accountId: string, platform: string, actorId: string) {
  const row = await prisma.integration.findUnique({
    where: { accountId_platform: { accountId, platform } },
  });
  if (!row) throw badRequest('Conecte a plataforma antes de configurar o webhook');
  if (!isSealedSecret(row.inboundSecret)) throw badRequest('Segredo de webhook ausente - gere um novo');

  await writeAudit(prisma, {
    entityType: 'USER',
    entityId: actorId,
    action: 'INTEGRATION_SECRET_REVEALED',
    actorId,
    data: { platform, accountId },
  });
  logger.info('segredo de webhook revelado', { platform, accountId, actor: actorId });

  const secret = decryptJson<{ value: string }>(row.inboundSecret as unknown as SealedSecret).value;
  return {
    platform,
    webhookUrl: buildWebhookUrl(env.webhookPublicUrl, platform, row.webhookKey),
    secret,
    header: INBOUND_HEADER[platform] ?? null,
  };
}

/**
 * Rotaciona o segredo. O anterior deixa de valer no ato - os leads da
 * plataforma falham a verificação até o novo valor ser colado no painel dela.
 * A webhookKey (a URL) NÃO muda: rotacionar credencial não deveria obrigar a
 * reconfigurar o endereço.
 */
export async function rotateInboundSecret(accountId: string, platform: string, actorId: string) {
  const row = await prisma.integration.findUnique({
    where: { accountId_platform: { accountId, platform } },
  });
  if (!row) throw badRequest('Conecte a plataforma antes de configurar o webhook');

  const secret = generateInboundSecret();
  await prisma.integration.update({
    where: { accountId_platform: { accountId, platform } },
    data: { inboundSecret: sealSecret(secret) },
  });
  await writeAudit(prisma, {
    entityType: 'USER',
    entityId: actorId,
    action: 'INTEGRATION_SECRET_ROTATED',
    actorId,
    data: { platform, accountId },
  });
  logger.info('segredo de webhook rotacionado', { platform, accountId, actor: actorId });

  return {
    platform,
    webhookUrl: buildWebhookUrl(env.webhookPublicUrl, platform, row.webhookKey),
    secret,
    header: INBOUND_HEADER[platform] ?? null,
  };
}
