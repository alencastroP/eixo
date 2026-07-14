import 'dotenv/config';

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProd = nodeEnv === 'production';

/**
 * Lê uma variável obrigatória. Em desenvolvimento aceita um fallback explícito;
 * em produção a ausência derruba o processo no boot (fail fast).
 */
function required(name: string, devFallback?: string): string {
  const value = process.env[name];
  if (value && value.length > 0) return value;
  if (!isProd && devFallback !== undefined) return devFallback;
  throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
}

function toInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const env = {
  nodeEnv,
  isProd,
  apiPort: toInt(process.env.PORT, 3001),
  webhookPort: toInt(process.env.WEBHOOK_PORT, 3002),
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  databaseUrl: required('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5433/crm?schema=public'),

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-inseguro'),
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtlDays: toInt(process.env.JWT_REFRESH_TTL_DAYS, 7),
  },

  security: {
    // chave para cifrar credenciais de integração em repouso (AES-256-GCM)
    credentialsSecret: required('CREDENTIALS_SECRET', 'dev-credentials-secret-inseguro'),
    // pepper do hash de unicidade de CPF do trial (nunca versionar em produção)
    trialCpfPepper: required('TRIAL_CPF_PEPPER', 'dev-trial-cpf-pepper-inseguro'),
  },

  rules: {
    dedupWindowHours: toInt(process.env.DEDUP_WINDOW_HOURS, 72),
    slaFirstResponseMinutes: toInt(process.env.SLA_FIRST_RESPONSE_MINUTES, 30),
  },

  rateLimit: {
    globalPerMinute: toInt(process.env.RATE_LIMIT_GLOBAL_PER_MIN, 300),
    authPer15Min: toInt(process.env.RATE_LIMIT_AUTH_PER_15MIN, 20),
    webhookPerMinute: toInt(process.env.RATE_LIMIT_WEBHOOK_PER_MIN, 120),
    trialPerHour: toInt(process.env.RATE_LIMIT_TRIAL_PER_HOUR, 5),
  },

  // Janela de retenção (LGPD — expurgo). Ver scripts/purge.ts.
  retention: {
    webhookEventDays: toInt(process.env.RETENTION_WEBHOOK_EVENT_DAYS, 90),
    creditQueryDays: toInt(process.env.RETENTION_CREDIT_QUERY_DAYS, 365),
    auditLogDays: toInt(process.env.RETENTION_AUDIT_LOG_DAYS, 730),
  },

  worker: {
    pollIntervalMs: toInt(process.env.WORKER_POLL_INTERVAL_MS, 2000),
    batchSize: toInt(process.env.WORKER_BATCH_SIZE, 20),
    maxAttempts: toInt(process.env.WORKER_MAX_ATTEMPTS, 5),
    retryDelayMs: toInt(process.env.WORKER_RETRY_DELAY_MS, 30_000),
    inline: (process.env.WORKER_INLINE ?? 'true') !== 'false',
  },

  // Credenciais de webhook por plataforma — consumidas apenas pelos adapters.
  integrations: {
    olxWebhookToken: process.env.OLX_WEBHOOK_TOKEN,
    mercadoLivreWebhookSecret: process.env.MERCADOLIVRE_WEBHOOK_SECRET,
    webmotorsWebhookToken: process.env.WEBMOTORS_WEBHOOK_TOKEN,
  },

  // Agente de Pré-Venda IA (Claude). Sem apiKey, o bot fica indisponível e as
  // conversas seguem 100% humanas (o toggle no front aparece desabilitado).
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    // Padrão: modelo mais capaz. Para este caso (alto volume/baixa latência)
    // pode-se apontar para 'claude-sonnet-5' ou 'claude-haiku-4-5' via env.
    model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8',
    // teto de segurança: nº de rodadas de tool-use por mensagem recebida
    maxToolIterations: toInt(process.env.ANTHROPIC_MAX_TOOL_ITERATIONS, 4),
    maxTokens: toInt(process.env.ANTHROPIC_MAX_TOKENS, 1024),
  },
} as const;

/** true quando o Agente de IA está configurado (há API key). */
export const aiEnabled = () => Boolean(env.ai.apiKey);
