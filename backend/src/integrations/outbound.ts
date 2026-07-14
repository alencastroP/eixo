import { DispatchStatus } from '@prisma/client';
import { decryptJson, isSealedSecret, type SealedSecret } from '../lib/crypto';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { findAdapter } from './core/registry';
import type { NormalizedLead, PlatformCredentials } from './core/types';

interface DispatchArgs {
  platform: string;
  ticketId: string;
  interactionId: string;
  leadName: string;
  externalLeadId?: string | null;
  body: string;
  vehicle?: NormalizedLead['vehicle'];
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
 * de origem. Isolado em integrations/ — a lógica de ticket não conhece a API externa.
 *
 * Nunca lança: qualquer falha vira log de despacho (SENT/FAILED/SKIPPED) e é
 * absorvida aqui, para não impactar o registro da resposta no CRM.
 */
export async function dispatchOutboundReply(args: DispatchArgs): Promise<void> {
  try {
    const adapter = findAdapter(args.platform);
    // Plataforma sem suporte a envio (ex.: 'manual', ou adapters somente-recepção): nada a fazer.
    if (!adapter?.sendReply || !adapter.supportsOutbound) return;

    const integration = await prisma.integration.findUnique({ where: { platform: args.platform } });
    if (!integration) return; // integração nunca configurada

    if (integration.status !== 'CONNECTED' || !integration.syncEnabled) {
      await record(integration.id, args, DispatchStatus.SKIPPED, 'integração não conectada ou sincronização desativada');
      return;
    }
    if (!isSealedSecret(integration.credentials)) {
      await record(integration.id, args, DispatchStatus.SKIPPED, 'credenciais ausentes');
      return;
    }

    const credentials = decryptJson<PlatformCredentials>(integration.credentials as unknown as SealedSecret);
    const result = await adapter.sendReply({
      credentials,
      externalLeadId: args.externalLeadId,
      leadName: args.leadName,
      body: args.body,
      vehicle: args.vehicle,
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
