/**
 * Serviço de recepção de webhooks — processo INDEPENDENTE da API principal.
 *
 * Pode escalar horizontalmente (N instâncias atrás de um load balancer) sem
 * afetar o CRM: a única responsabilidade é autenticar e enfileirar o payload
 * bruto em webhook_events. Em dev, o worker roda embutido aqui (WORKER_INLINE);
 * em produção, rode `start:worker` como processo próprio e desligue o inline.
 */
import express from 'express';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { requestLog } from './middleware/request-log';
import { securityHeaders, webhookRateLimit } from './middleware/security';
import { webhookRouter } from './webhooks/webhook.routes';
import { startWorker } from './workers/lead-processor';

const app = express();
app.disable('x-powered-by');
if (env.isProd) app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(
  express.json({
    limit: '1mb',
    // guarda o corpo bruto para verificação HMAC (ex.: Mercado Livre)
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(requestLog);

app.get('/health', (_req, res) => res.json({ ok: true, service: 'crm-webhooks' }));
app.use(webhookRateLimit, webhookRouter);
app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.webhookPort, () => {
  logger.info('serviço de webhooks no ar', { port: env.webhookPort, env: env.nodeEnv });
});

const stopWorker = env.worker.inline ? startWorker('lead-processor inline') : undefined;

const shutdown = () => {
  stopWorker?.();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
