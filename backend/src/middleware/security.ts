import type { RequestHandler } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

/**
 * Cabeçalhos de segurança (HSTS, X-Frame-Options, X-Content-Type-Options,
 * Referrer-Policy, etc.). Como estes serviços expõem uma API JSON consumida por
 * fetch, a CSP relevante para XSS pertence ao host do frontend — aqui mantemos
 * uma CSP mínima e desligamos apenas o que quebraria o consumo cross-origin.
 *
 * `crossOriginResourcePolicy: cross-origin` é necessário para o front (:5173)
 * conseguir carregar as imagens estáticas servidas em /uploads pela API (:3001).
 */
export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      // API não serve HTML/scripts próprios; trava tudo por padrão.
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:'],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // HSTS só faz sentido atrás de HTTPS (produção); inofensivo em dev.
  hsts: env.isProd ? { maxAge: 15_552_000, includeSubDomains: true } : false,
});

/**
 * Limite global brando (protege contra scraping/abuso geral). Chaveado por IP.
 * Rotas sensíveis recebem limites próprios, mais estritos, por baixo deste.
 */
export const globalRateLimit = rateLimit({
  windowMs: 60_000,
  limit: env.rateLimit.globalPerMinute,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Muitas requisições. Tente novamente em instantes.', code: 'RATE_LIMITED' } },
});

/**
 * Limite estrito para autenticação (login/refresh): mitiga força-bruta de
 * credenciais e enumeração. Conta apenas requisições que falham (skipSuccessful),
 * para não punir o uso legítimo repetido do refresh.
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.rateLimit.authPer15Min,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { message: 'Muitas tentativas de autenticação. Aguarde alguns minutos.', code: 'AUTH_RATE_LIMITED' },
  },
});

/**
 * Limite ESTRITO para o cadastro de trial: mitiga bots testando CPFs em
 * sequência (enumeração/abuso). Poucas tentativas por IP por hora.
 */
export const trialRateLimit = rateLimit({
  windowMs: 60 * 60_000,
  limit: env.rateLimit.trialPerHour,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { message: 'Muitas tentativas de cadastro. Tente novamente mais tarde.', code: 'TRIAL_RATE_LIMITED' },
  },
});

/**
 * Limite para o formulário da vitrine pública. A rota é aberta e escreve no
 * banco (lead + ticket), então precisa de teto próprio por IP — junto com o
 * honeypot do formulário, mantém spam de bot fora do funil de atendimento.
 */
export const siteLeadRateLimit = rateLimit({
  windowMs: 60 * 60_000,
  limit: env.rateLimit.siteLeadPerHour,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { message: 'Muitos envios em sequência. Tente novamente mais tarde.', code: 'SITE_LEAD_RATE_LIMITED' },
  },
});

/**
 * Limite do chat com a IA na vitrine. Mais folgado que o do formulário (é uma
 * conversa, não um envio único), porém finito: cada mensagem custa uma chamada
 * ao modelo, então o teto protege o custo além do abuso.
 */
export const siteChatRateLimit = rateLimit({
  windowMs: 60 * 60_000,
  limit: env.rateLimit.siteChatPerHour,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { message: 'Muitas mensagens em sequência. Continue pelo WhatsApp.', code: 'SITE_CHAT_RATE_LIMITED' },
  },
});

/**
 * Limite da CONSULTA por novas mensagens (o widget pergunta de tempos em tempos
 * se o atendente respondeu). Precisa de janela por minuto, e não por hora: o
 * teto do envio existe para conter custo de modelo, enquanto aqui cada chamada é
 * uma leitura indexada. Reaproveitar o limite do envio secaria a entrega das
 * respostas do atendente no meio da conversa.
 */
export const siteChatPollRateLimit = rateLimit({
  windowMs: 60_000,
  limit: env.rateLimit.siteChatPollPerMinute,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { message: 'Muitas consultas em sequência. Aguarde um instante.', code: 'SITE_CHAT_POLL_RATE_LIMITED' },
  },
});

/** Limite para a recepção de webhooks (por plataforma/IP) — evita inundar a fila. */
export const webhookRateLimit = rateLimit({
  windowMs: 60_000,
  limit: env.rateLimit.webhookPerMinute,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Limite de recepção excedido.', code: 'WEBHOOK_RATE_LIMITED' } },
});
