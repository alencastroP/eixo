import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { requestLog } from './middleware/request-log';
import { globalRateLimit, securityHeaders } from './middleware/security';
import { authenticate } from './middleware/auth';
import { requireActiveAccount } from './middleware/tenant';
import { UPLOADS_PUBLIC_PREFIX, UPLOADS_ROOT } from './lib/storage';
import { authRouter } from './modules/auth/auth.routes';
import { trialRouter } from './modules/trial/trial.routes';
import { usersRouter } from './modules/users/users.routes';
import { ticketsRouter } from './modules/tickets/tickets.routes';
import { leadsRouter } from './modules/leads/leads.routes';
import { integrationsRouter } from './modules/integrations/integrations.routes';
import { vehiclesRouter } from './modules/vehicles/vehicles.routes';
import { creditRouter } from './modules/credit/credit.routes';
import { financeRouter } from './modules/finance/finance.routes';
import { fiscalRouter } from './modules/fiscal/fiscal.routes';
import { settingsRouter } from './modules/settings/settings.routes';
import { webhookEventsRouter } from './webhooks/webhook-events.routes';

/** API principal do CRM (autenticada). A recepção de webhooks vive em outro processo. */
export function createApiApp() {
  const app = express();
  app.disable('x-powered-by');
  // atrás de proxy/LB em produção: confia no X-Forwarded-* para IP real (rate limit)
  if (env.isProd) app.set('trust proxy', 1);
  app.use(securityHeaders);
  app.use(cors({ origin: env.corsOrigins }));
  // limite generoso: uploads de fotos do estoque chegam como data URL base64 no JSON
  app.use(express.json({ limit: '30mb' }));
  app.use(requestLog);
  app.use(globalRateLimit);

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'crm-api' }));

  // fotos do estoque servidas estaticamente (em produção, trocar por bucket/CDN)
  app.use(UPLOADS_PUBLIC_PREFIX, express.static(UPLOADS_ROOT));

  // Rotas públicas (sem conta): autenticação e cadastro de trial.
  app.use('/api/auth', authRouter);
  app.use('/api/trial', trialRouter);

  // Portão do SaaS: rotas de negócio exigem conta ATIVA (trial válido ou paga).
  // `authenticate` roda aqui para popular req.user antes do guard de tenant;
  // uma conta expirada/inadimplente recebe 403 ACCOUNT_BLOCKED (dados preservados).
  const tenant = [authenticate, requireActiveAccount];
  app.use('/api/users', tenant, usersRouter);
  app.use('/api/tickets', tenant, ticketsRouter);
  app.use('/api/leads', tenant, leadsRouter);
  app.use('/api/integrations', tenant, integrationsRouter);
  app.use('/api/vehicles', tenant, vehiclesRouter);
  app.use('/api/credit', tenant, creditRouter);
  app.use('/api/finance', tenant, financeRouter);
  app.use('/api/fiscal', tenant, fiscalRouter);
  app.use('/api/settings', tenant, settingsRouter);
  app.use('/api/webhook-events', tenant, webhookEventsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
