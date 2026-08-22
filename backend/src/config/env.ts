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
    siteLeadPerHour: toInt(process.env.RATE_LIMIT_SITE_LEAD_PER_HOUR, 15),
    siteChatPerHour: toInt(process.env.RATE_LIMIT_SITE_CHAT_PER_HOUR, 60),
    siteChatPollPerMinute: toInt(process.env.RATE_LIMIT_SITE_CHAT_POLL_PER_MIN, 60),
  },

  // Janela de retenção (LGPD - expurgo). Ver scripts/purge.ts.
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

  /**
   * Host público desta própria API - usado para montar a URL ABSOLUTA das
   * imagens enviadas (logo/hero da vitrine, fotos de veículo). Necessário
   * porque em produção o front (Cloudflare Workers) e a API (Render) vivem em
   * domínios diferentes: uma URL relativa como "/uploads/..." resolve contra
   * a origem da página que a exibe, não contra quem guarda o arquivo - a
   * imagem carrega em dev (o proxy do Vite cobre o mesmo host) e quebra em
   * produção. Ver lib/storage.ts.
   */
  apiPublicUrl: (process.env.API_PUBLIC_URL ?? 'http://localhost:3001').replace(/\/+$/, ''),

  /**
   * Bucket Cloudflare R2 das imagens enviadas. Preenchido = produção grava no
   * bucket; vazio = grava em disco (desenvolvimento). Ver lib/storage.ts.
   *
   * Existe porque o serviço roda no plano free do Render, que não tem disco
   * persistente: o /uploads é descartado a cada deploy.
   */
  r2: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    bucket: process.env.R2_BUCKET ?? '',
    endpoint: process.env.R2_ENDPOINT ?? '',
    /** Host público de leitura (r2.dev ou domínio próprio), sem barra final. */
    publicUrl: (process.env.R2_PUBLIC_URL ?? '').replace(/\/+$/, ''),
  },

  /**
   * Host público do serviço de webhooks - usado só para MONTAR a URL que o
   * lojista cola no painel da plataforma (`/webhooks/:platform/:webhookKey`).
   *
   * Os segredos de webhook não moram mais aqui: cada conta tem o seu, cifrado
   * em `integrations.inboundSecret`. As antigas OLX_WEBHOOK_TOKEN,
   * MERCADOLIVRE_WEBHOOK_SECRET e WEBMOTORS_WEBHOOK_TOKEN eram únicas para toda
   * a instalação - qualquer lojista podia forjar lead no funil de outro.
   */
  webhookPublicUrl: process.env.WEBHOOK_PUBLIC_URL ?? 'http://localhost:3002',

  /**
   * Gateway de recorrência (Asaas). É o motor de assinatura do SaaS: cobrança
   * recorrente em cartão/PIX/boleto, retentativa, régua de inadimplência e
   * emissão de NFS-e - nada disso é reescrito aqui dentro.
   *
   * Sem `apiKey` o módulo de Pagamentos entra em modo somente-leitura: a tela
   * abre, mostra plano e faturas já gravados, e as ações de assinar/trocar
   * respondem 503 em vez de falhar no meio de uma cobrança.
   *
   * `webhookToken` é o segredo que ESTE serviço exige de volta no header
   * `asaas-access-token` - o mesmo valor precisa ser cadastrado no painel do
   * Asaas ao criar o webhook. Sem ele, qualquer um poderia forjar
   * "PAYMENT_CONFIRMED" e liberar acesso de graça.
   */
  billing: {
    provider: process.env.BILLING_PROVIDER ?? 'asaas',
    asaas: {
      apiKey: process.env.ASAAS_API_KEY ?? '',
      /** 'sandbox' (padrão) ou 'production'. Erra para o lado seguro. */
      mode: process.env.ASAAS_ENV === 'production' ? 'production' : 'sandbox',
      webhookToken: process.env.ASAAS_WEBHOOK_TOKEN ?? '',
      /** Carteira de recebimento, quando a conta usa split/subcontas. */
      walletId: process.env.ASAAS_WALLET_ID ?? '',
      /** Emitir NFS-e junto de cada cobrança (exige config fiscal no Asaas). */
      issueNfse: process.env.ASAAS_ISSUE_NFSE === 'true',
      /** Nome do serviço municipal na nota - varia por prefeitura. */
      nfseServiceName: process.env.ASAAS_NFSE_SERVICE_NAME ?? 'Licenciamento de software de gestão (SaaS)',
      nfseObservations: process.env.ASAAS_NFSE_OBSERVATIONS ?? '',
      nfseDaysBeforeDueDate: toInt(process.env.ASAAS_NFSE_DAYS_BEFORE_DUE, 0),
    },
    /**
     * Dias de tolerância entre o vencimento e o bloqueio efetivo da conta.
     *
     * O padrão 7 não é arbitrário: é o prazo que os Termos de Uso prometem ao
     * cliente (cl. 8.2). Documento e sistema precisam dizer o mesmo número -
     * um contrato que promete 7 dias sobre um sistema que corta em 3 é o tipo
     * de divergência que só aparece quando vira reclamação.
     */
    graceDays: toInt(process.env.BILLING_GRACE_DAYS, 7),
  },

  /**
   * Bureau de crédito (Assertiva, produto "Credito Mix").
   *
   * Sem `clientId`/`clientSecret` o módulo NÃO quebra: a consulta cai no bureau
   * simulado e o laudo sai marcado como tal, com o aviso "Resultado simulado"
   * na tela. Ver modules/credit/bureau/index.ts.
   *
   * `finalidade` é exigência de LGPD da própria Assertiva: 2 = ciclo de crédito,
   * 4 = execução de contrato. Precisa bater com o termo que o titular autorizou
   * (legal/09-CONSENTIMENTO-CONSULTA-DE-CREDITO.md) - para consulta de
   * financiamento, é 2.
   *
   * `opcoes` são módulos incrementais, CADA UM COBRADO À PARTE por consulta:
   * ACOES (ações judiciais) e POSITIVO (Cadastro Positivo). Só vale pedir o que
   * a tela mostra - o padrão pede ACOES e deixa POSITIVO de fora.
   */
  credit: {
    provider: process.env.CREDIT_BUREAU_PROVIDER ?? 'assertiva',
    assertiva: {
      clientId: process.env.ASSERTIVA_CLIENT_ID ?? '',
      clientSecret: process.env.ASSERTIVA_CLIENT_SECRET ?? '',
      baseUrl: (process.env.ASSERTIVA_BASE_URL ?? 'https://api.assertivasolucoes.com.br').replace(/\/+$/, ''),
      finalidade: process.env.ASSERTIVA_FINALIDADE ?? '2',
      opcoes: process.env.ASSERTIVA_OPCOES ?? 'ACOES',
    },
  },

  // E-mail transacional (Resend). Sem apiKey, o envio vira log e a aplicação
  // segue normalmente - ver emailEnabled() e lib/email.ts.
  email: {
    apiKey: process.env.RESEND_API_KEY ?? '',
    // 'onboarding@resend.dev' é o remetente de teste do próprio Resend: funciona
    // sem domínio verificado, mas só entrega para o e-mail da conta Resend.
    // Trocar por um remetente do domínio próprio (com SPF/DKIM/DMARC) antes de
    // qualquer envio real a clientes.
    from: process.env.EMAIL_FROM ?? 'Eixo <onboarding@resend.dev>',
    replyTo: process.env.EMAIL_REPLY_TO || undefined,
  },

  // Base para montar links absolutos nos e-mails (botão "Ver na plataforma").
  appUrl: (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),

  /**
   * Id da ÚNICA conta com acesso ao módulo de Plataforma (visão de todas as
   * contas + acesso de suporte). Vazio = módulo inteiro fica fechado - nenhuma
   * conta, nem a que viria a ser criada com este id depois, entra sem que a
   * variável esteja preenchida.
   *
   * Deliberadamente uma env var, não uma coluna/flag no banco: trocar exige
   * redeploy, o mesmo atrito que já existe para `CREDENTIALS_SECRET` e
   * `TRIAL_CPF_PEPPER`. Ver middleware/platform.ts.
   */
  platformAccountId: process.env.PLATFORM_ACCOUNT_ID ?? '',

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

/** true quando o gateway de pagamento está configurado (há API key). */
export const billingEnabled = () => Boolean(env.billing.asaas.apiKey);

/** true quando o envio de e-mail está configurado (há API key do Resend). */
export const emailEnabled = () => Boolean(env.email.apiKey);

/**
 * Verifica se uma origem tem permissão de CORS.
 *
 * Cada vitrine de loja mora em um subdomínio próprio (washington.eixo.com.br) e
 * consome esta mesma API, então CORS_ORIGIN aceita entradas com curinga de
 * subdomínio - `https://*.eixo.com.br`. O curinga cobre UM nível de rótulo e
 * não vale para o domínio nu, que precisa ser listado à parte se for usado.
 */
export function isAllowedOrigin(origin: string): boolean {
  return env.corsOrigins.some((allowed) => {
    if (!allowed.includes('*')) return allowed === origin;
    const [scheme, host] = allowed.split('://');
    if (!host?.startsWith('*.')) return false;
    const suffix = host.slice(1); // ".eixo.com.br"
    const originHost = origin.startsWith(`${scheme}://`) ? origin.slice(scheme.length + 3) : null;
    return Boolean(originHost && originHost.endsWith(suffix) && !originHost.slice(0, -suffix.length).includes('.'));
  });
}
