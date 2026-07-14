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

/** Limite para a recepção de webhooks (por plataforma/IP) — evita inundar a fila. */
export const webhookRateLimit = rateLimit({
  windowMs: 60_000,
  limit: env.rateLimit.webhookPerMinute,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Limite de recepção excedido.', code: 'WEBHOOK_RATE_LIMITED' } },
});
