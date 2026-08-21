import { DispatchStatus } from '@prisma/client';
import { decryptJson, isSealedSecret, type SealedSecret } from '../lib/crypto';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { findAdapter } from './core/registry';
import type { NormalizedLead, PlatformCredentials } from './core/types';

interface DispatchArgs {
  /** Conta dona do ticket - define de QUAL loja são as credenciais usadas. */
  accountId: string;
  platform: string;
  ticketId: string;
  interactionId: string;
  leadName: string;
  externalLeadId?: string | null;
  body: string;
  vehicle?: NormalizedLead['vehicle'];
  /**
   * Quem escreveu a resposta. Em canais de mensageria a resposta sai pelo
   * número DELE quando há um conectado no perfil (ver UserChannel); sem isso
   * toda a loja falaria pelo mesmo remetente e o cliente perderia a referência
   * de com quem estava conversando.
   */
  actorId?: string | null;
  /** Telefone do lead (dígitos) - destinatário em canais endereçados por número. */
  leadPhone?: string | null;
}

async function record(
  integrationId: string,
  args: DispatchArgs,
  status: DispatchStatus,
  detail: string,
  externalRef?: string,
): Promise<void> {
  await prisma.integrationDispatch.create({
    data: {
      integrationId,
      platform: args.platform,
      ticketId: args.ticketId,
      interactionId: args.interactionId,
      status,
      detail,
      externalRef,
    },
  });
}

/**
 * Fluxo OUTBOUND: replica a resposta do operador de volta ao cliente na plataforma
 * de origem. Isolado em integrations/ - a lógica de ticket não conhece a API externa.
 *
 * Nunca lança: qualquer falha vira log de despacho (SENT/FAILED/SKIPPED) e é
 * absorvida aqui, para não impactar o registro da resposta no CRM.
 */
export async function dispatchOutboundReply(args: DispatchArgs): Promise<void> {
  try {
    const adapter = findAdapter(args.platform);
    // Plataforma sem suporte a envio (ex.: 'manual', ou adapters somente-recepção): nada a fazer.
    if (!adapter?.sendReply || !adapter.supportsOutbound) return;

    // Credenciais DA LOJA dona do ticket. Sem o filtro por conta, a resposta de
    // um lojista sairia autenticada com a chave de API de outro.
    const integration = await prisma.integration.findUnique({
      where: { accountId_platform: { accountId: args.accountId, platform: args.platform } },
    });
    if (!integration) return; // integração nunca configurada nesta conta

    if (integration.status !== 'CONNECTED' || !integration.syncEnabled) {
      await record(integration.id, args, DispatchStatus.SKIPPED, 'integração não conectada ou sincronização desativada');
      return;
    }
    if (!isSealedSecret(integration.credentials)) {
      await record(integration.id, args, DispatchStatus.SKIPPED, 'credenciais ausentes');
      return;
    }

    // Remetente do atendente, quando ele conectou um canal próprio no perfil.
    // Ausente (ou plataforma sem canal por usuário) -> o adapter cai no número
    // padrão da conta.
    const channel = args.actorId
      ? await prisma.userChannel.findUnique({
          where: { userId_platform: { userId: args.actorId, platform: args.platform } },
          select: { externalId: true, accountId: true },
        })
      : null;
    // Guarda de tenant: o canal precisa ser da MESMA conta do ticket. Sem isso,
    // um usuário movido de loja responderia pelo número da anterior.
    const senderExternalId = channel && channel.accountId === args.accountId ? channel.externalId : null;

    const credentials = decryptJson<PlatformCredentials>(integration.credentials as unknown as SealedSecret);
    const result = await adapter.sendReply({
      credentials,
      externalLeadId: args.externalLeadId,
      leadName: args.leadName,
      body: args.body,
      vehicle: args.vehicle,
      senderExternalId,
      recipientPhone: args.leadPhone,
    });

    if (result.ok) {
      await record(integration.id, args, DispatchStatus.SENT, 'resposta replicada na plataforma', result.externalRef);
    } else {
      await record(integration.id, args, DispatchStatus.FAILED, result.error ?? 'falha no envio');
      logger.warn('outbound: envio rejeitado pela plataforma', { platform: args.platform, ticketId: args.ticketId });
    }
  } catch (err) {
    logger.error('outbound: erro inesperado no despacho', { platform: args.platform, ticketId: args.ticketId, err });
  }
}
