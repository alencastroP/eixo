import { IntegrationStatus, Prisma } from '@prisma/client';
import { badRequest, notFound } from '../../lib/errors';
import { decryptJson, isSealedSecret, type SealedSecret } from '../../lib/crypto';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { findAdapter, listAdapters } from '../../integrations';
import type { ChannelSender, PlatformCredentials } from '../../integrations';
import { writeAudit } from '../audit/audit.service';

/**
 * Canais de atendimento POR ATENDENTE.
 *
 * Complementa o módulo de Integrações, que é da loja: lá o admin conecta a
 * conta da plataforma (a WABA do WhatsApp, com o token); aqui cada atendente
 * escolhe QUAL remetente daquela conta é o dele, para as respostas saírem pelo
 * número próprio em vez de todas pelo mesmo.
 *
 * Toda função recebe o usuário e a conta do token - nunca do corpo. Um
 * atendente só mexe no canal dele, e apenas dentro de remetentes que a loja
 * dele provisionou.
 */

/** Serializa o canal do jeito que a tela de perfil consome. */
function serialize(row: {
  platform: string;
  externalId: string;
  displayNumber: string;
  verifiedName: string | null;
  connectedAt: Date;
}) {
  return {
    platform: row.platform,
    externalId: row.externalId,
    displayNumber: row.displayNumber,
    verifiedName: row.verifiedName,
    connectedAt: row.connectedAt,
  };
}

/**
 * Credenciais da loja para a plataforma, já decifradas. Erra cedo e com motivo
 * legível: o atendente não pode conectar um número enquanto o admin não tiver
 * conectado a conta da loja, e essa é a causa mais provável de "não aparece
 * nenhum número".
 */
async function accountCredentials(accountId: string, platform: string): Promise<PlatformCredentials> {
  const integration = await prisma.integration.findUnique({
    where: { accountId_platform: { accountId, platform } },
    select: { status: true, syncEnabled: true, credentials: true },
  });

  if (!integration || !isSealedSecret(integration.credentials)) {
    throw badRequest(
      'A conta da loja nesta plataforma ainda não foi conectada. Peça a um administrador para conectá-la em Administração › Integrações.',
      'INTEGRATION_NOT_CONNECTED',
    );
  }
  if (integration.status === IntegrationStatus.AUTH_ERROR) {
    throw badRequest(
      'As credenciais da loja nesta plataforma estão com erro de autenticação. Um administrador precisa corrigi-las em Integrações.',
      'INTEGRATION_AUTH',
    );
  }

  return decryptJson<PlatformCredentials>(integration.credentials as unknown as SealedSecret);
}

/** Plataformas que suportam canal por atendente (hoje só o WhatsApp). */
export function listChannelPlatforms() {
  return listAdapters()
    .filter((a) => a.supportsUserChannels)
    .map((a) => ({ platform: a.platform, displayName: a.displayName }));
}

/** Canais que ESTE atendente já conectou. */
export async function listMyChannels(userId: string) {
  const rows = await prisma.userChannel.findMany({
    where: { userId },
    orderBy: { platform: 'asc' },
  });
  return rows.map(serialize);
}

/**
 * Remetentes que o atendente pode reivindicar, com os já tomados marcados.
 *
 * Mostrar os ocupados (em vez de omiti-los) é deliberado: sem isso, um número
 * que não aparece na lista é indistinguível de um número que a loja não
 * provisionou, e o atendente não teria como saber que precisa falar com o colega
 * que o está usando.
 */
export async function listAvailableSenders(accountId: string, userId: string, platform: string) {
  const adapter = findAdapter(platform);
  if (!adapter?.supportsUserChannels || !adapter.listSenders) {
    throw notFound(`Plataforma sem canal por atendente: ${platform}`);
  }

  const credentials = await accountCredentials(accountId, platform);

  let senders: ChannelSender[];
  try {
    senders = await adapter.listSenders(credentials);
  } catch (err) {
    logger.warn('canais: falha ao listar remetentes na plataforma', { platform, accountId, err });
    throw badRequest('Não foi possível consultar os números na plataforma agora. Tente novamente.');
  }

  // Quem já tomou cada remetente NESTA conta.
  const taken = await prisma.userChannel.findMany({
    where: { accountId, platform, externalId: { in: senders.map((s) => s.externalId) } },
    select: { externalId: true, userId: true, user: { select: { name: true } } },
  });
  const byExternalId = new Map(taken.map((t) => [t.externalId, t]));

  return senders.map((s) => {
    const owner = byExternalId.get(s.externalId);
    return {
      ...s,
      takenBy: owner && owner.userId !== userId ? owner.user.name : null,
      isMine: owner?.userId === userId,
    };
  });
}

/**
 * Conecta um remetente ao atendente.
 *
 * O `externalId` é conferido contra a lista real da plataforma antes de gravar:
 * aceitar o valor do corpo sem checar deixaria um atendente registrar o número
 * de outra loja e receber, no perfil dele, o rótulo de um remetente que não é da
 * conta dele.
 */
export async function connectMyChannel(accountId: string, userId: string, platform: string, externalId: string) {
  const adapter = findAdapter(platform);
  if (!adapter?.supportsUserChannels || !adapter.listSenders) {
    throw notFound(`Plataforma sem canal por atendente: ${platform}`);
  }

  const credentials = await accountCredentials(accountId, platform);

  let senders: ChannelSender[];
  try {
    senders = await adapter.listSenders(credentials);
  } catch (err) {
    logger.warn('canais: falha ao validar remetente na plataforma', { platform, accountId, err });
    throw badRequest('Não foi possível confirmar o número na plataforma agora. Tente novamente.');
  }

  const sender = senders.find((s) => s.externalId === externalId);
  if (!sender) throw badRequest('Este número não pertence à conta da loja nesta plataforma.');

  try {
    const row = await prisma.userChannel.upsert({
      where: { userId_platform: { userId, platform } },
      update: {
        externalId: sender.externalId,
        displayNumber: sender.displayNumber,
        verifiedName: sender.verifiedName ?? null,
        accountId,
        connectedAt: new Date(),
        lastCheckedAt: new Date(),
        lastError: null,
      },
      create: {
        userId,
        accountId,
        platform,
        externalId: sender.externalId,
        displayNumber: sender.displayNumber,
        verifiedName: sender.verifiedName ?? null,
      },
    });

    await writeAudit(prisma, {
      entityType: 'USER',
      entityId: userId,
      action: 'USER_CHANNEL_CONNECTED',
      actorId: userId,
      data: { platform, accountId, externalId: sender.externalId },
    });
    logger.info('canal de atendente conectado', { platform, accountId, userId });
    return serialize(row);
  } catch (err) {
    // O unique (accountId, platform, externalId) é a trava de corrida: dois
    // atendentes escolhendo o mesmo número ao mesmo tempo passam os dois pela
    // checagem de "takenBy" acima, e só o banco decide quem fica com ele.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw badRequest('Este número acabou de ser conectado por outro atendente.');
    }
    throw err;
  }
}

/** Desconecta o canal do próprio atendente (as respostas voltam ao número padrão da loja). */
export async function disconnectMyChannel(userId: string, platform: string) {
  const row = await prisma.userChannel.findUnique({ where: { userId_platform: { userId, platform } } });
  if (!row) throw notFound('Nenhum canal conectado nesta plataforma');

  await prisma.userChannel.delete({ where: { id: row.id } });
  await writeAudit(prisma, {
    entityType: 'USER',
    entityId: userId,
    action: 'USER_CHANNEL_DISCONNECTED',
    actorId: userId,
    data: { platform, accountId: row.accountId, externalId: row.externalId },
  });
  logger.info('canal de atendente desconectado', { platform, userId });
}
