/**
 * Worker de processamento de leads.
 *
 * Consome a fila persistente (webhook_events) e transforma payloads brutos em
 * tickets: adapter.normalize() → ingestNormalizedLead(). Roda embutido no
 * webhook-server (dev) ou como processo separado (produção/escala):
 *   npm run dev:worker | npm run start:worker
 *
 * Seguro para múltiplas instâncias: cada evento é "reivindicado" com um update
 * condicional (RECEIVED → PROCESSING); quem perder a corrida pula o evento.
 * Falhas fazem retry com backoff até WORKER_MAX_ATTEMPTS; payload inválido
 * (AdapterPayloadError) falha direto — retry não conserta payload malformado.
 */
import '../integrations';
import { WebhookEventStatus } from '@prisma/client';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { AdapterPayloadError, getAdapter } from '../integrations';
import { ingestNormalizedLead } from '../modules/tickets/ingest.service';
import { handleInboundMessage } from '../modules/aiAgent/agent.service';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function processPendingEvents(): Promise<number> {
  const candidates = await prisma.webhookEvent.findMany({
    where: {
      status: WebhookEventStatus.RECEIVED,
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
    },
    orderBy: { receivedAt: 'asc' },
    take: env.worker.batchSize,
    select: { id: true },
  });

  let processed = 0;
  for (const { id } of candidates) {
    const claimed = await prisma.webhookEvent.updateMany({
      where: { id, status: WebhookEventStatus.RECEIVED },
      data: { status: WebhookEventStatus.PROCESSING },
    });
    if (claimed.count === 0) continue; // outra instância assumiu este evento

    const event = await prisma.webhookEvent.findUniqueOrThrow({ where: { id } });
    try {
      const adapter = getAdapter(event.platform);
      const normalized = adapter.normalize(event.payload);
      const result = await ingestNormalizedLead(event.platform, normalized);

      await prisma.webhookEvent.update({
        where: { id },
        data: {
          status: WebhookEventStatus.PROCESSED,
          processedAt: new Date(),
          ticketId: result.ticketId,
          lastError: null,
        },
      });
      processed += 1;
      logger.info(result.created ? 'ticket criado a partir de webhook' : 'mensagem anexada a ticket existente (dedup)', {
        eventId: id,
        platform: event.platform,
        ticketId: result.ticketId,
      });

      // Interceptador do Agente de Pré-Venda IA: se o bot estiver ativo para
      // este ticket, responde automaticamente. Fire-and-forget — o serviço
      // trata os próprios erros e nunca deve travar o processamento da fila.
      void handleInboundMessage(result.ticketId);
    } catch (err) {
      const attempts = event.attempts + 1;
      const permanent = err instanceof AdapterPayloadError;
      const failed = permanent || attempts >= env.worker.maxAttempts;

      await prisma.webhookEvent.update({
        where: { id },
        data: {
          status: failed ? WebhookEventStatus.FAILED : WebhookEventStatus.RECEIVED,
          attempts,
          lastError: (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).slice(0, 500),
          nextAttemptAt: failed ? null : new Date(Date.now() + attempts * env.worker.retryDelayMs),
        },
      });
      logger.error('falha ao processar evento de webhook', {
        eventId: id,
        platform: event.platform,
        attempts,
        permanent,
        err,
      });
    }
  }
  return processed;
}

export function startWorker(label = 'lead-processor'): () => void {
  let stopped = false;
  logger.info('worker iniciado', {
    label,
    pollIntervalMs: env.worker.pollIntervalMs,
    batchSize: env.worker.batchSize,
    maxAttempts: env.worker.maxAttempts,
  });

  void (async () => {
    while (!stopped) {
      let processed = 0;
      try {
        processed = await processPendingEvents();
      } catch (err) {
        logger.error('falha no ciclo do worker', { err });
      }
      // fila com itens → segue em ritmo acelerado; vazia → aguarda o poll interval
      await sleep(processed > 0 ? 100 : env.worker.pollIntervalMs);
    }
  })();

  return () => {
    stopped = true;
  };
}

// Execução standalone: npm run dev:worker / npm run start:worker
if (require.main === module) {
  const stop = startWorker('lead-processor standalone');
  const shutdown = async () => {
    stop();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
