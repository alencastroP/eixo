/**
 * Cliente HTTP da Assertiva (APIs V3).
 *
 * Responsabilidade única: autenticar, falar HTTP e traduzir falha deles em erro
 * nosso. A tradução do FORMATO do laudo mora em assertiva.provider.ts.
 *
 * Quatro cuidados que não são óbvios:
 *
 *  1. O token do OAuth2 deles é curtíssimo - a documentação exemplifica
 *     `expires_in: 60`. Sem cache, cada consulta viraria duas requisições; com
 *     cache ingênuo, viraria 401 intermitente. Daí a margem de segurança e o
 *     `inflight` compartilhado: dez consultas simultâneas renovam UM token.
 *  2. HTTP 202 não é sucesso aqui. A Assertiva responde 202 com `{message}`
 *     para "documento não localizado" / "dado não exibível" - `response.ok` é
 *     true e o corpo não tem laudo nenhum. Tratado explicitamente.
 *  3. Timeout explícito via AbortSignal. Bureau é fornecedor de terceiro com
 *     fornecedor de terceiro atrás; sem teto, uma instabilidade deles vira
 *     requisição pendurada aqui.
 *  4. O documento NUNCA entra em log - nem no log de erro. Só a máscara.
 *
 * Contrato conferido em https://integracao.assertivasolucoes.com.br/v3/doc/
 * (swagger oauth2 + mix), abril/2026.
 */
import { env } from '../../../config/env';
import { AppError } from '../../../lib/errors';
import { maskDocument } from '../../../lib/document';
import { logger } from '../../../lib/logger';

const TOKEN_PATH = '/oauth2/v3/token';
/** Renova antes de expirar: relógio dessincronizado não pode virar 401. */
const TOKEN_SAFETY_MS = 10_000;
const TIMEOUT_MS = 30_000;

export class AssertivaError extends AppError {
  constructor(
    message: string,
    httpStatus: number,
    code = 'CREDIT_BUREAU_ERROR',
  ) {
    super(httpStatus, message, code);
  }
}

/** 202: a consulta funcionou, o titular é que não tem dado para exibir. */
export class AssertivaNoData extends AssertivaError {
  constructor(message: string) {
    super(message, 404, 'CREDIT_DOCUMENT_NOT_FOUND');
  }
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

let cached: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string> | null = null;

function credentials() {
  const { clientId, clientSecret } = env.credit.assertiva;
  if (!clientId || !clientSecret) {
    throw new AssertivaError(
      'Bureau de crédito não configurado nesta instalação.',
      503,
      'CREDIT_BUREAU_UNAVAILABLE',
    );
  }
  return { clientId, clientSecret };
}

async function fetchToken(): Promise<string> {
  const { clientId, clientSecret } = credentials();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(`${env.credit.assertiva.baseUrl}${TOKEN_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const body = (await response.json().catch(() => ({}))) as Partial<TokenResponse> & {
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !body.access_token) {
    // A credencial é nossa, não do lojista: ele não tem como corrigir. Loga o
    // detalhe para o operador do SaaS e devolve mensagem que não vaza nada.
    logger.error('falha ao autenticar no bureau de crédito', {
      status: response.status,
      error: body.error,
      description: body.error_description,
    });
    throw new AssertivaError(
      'Não foi possível autenticar no bureau de crédito. O suporte já foi notificado.',
      502,
      'CREDIT_BUREAU_AUTH_FAILED',
    );
  }

  // `expires_in` vem em segundos; a documentação exemplifica 60.
  const ttlMs = Math.max(0, (body.expires_in ?? 60) * 1000 - TOKEN_SAFETY_MS);
  cached = { token: body.access_token, expiresAt: Date.now() + ttlMs };
  return body.access_token;
}

/** Token válido, renovando no máximo uma vez por vez. */
async function token(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token;
  if (inflight) return inflight;
  inflight = fetchToken().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Mensagem que o lojista lê, por status. O corpo deles é sempre `{message}`. */
function describe(status: number, message: string | undefined): AssertivaError {
  switch (status) {
    case 400:
      return new AssertivaError(message ?? 'Documento inválido.', 400, 'INVALID_DOCUMENT');
    case 401:
      return new AssertivaError(
        'A credencial do bureau de crédito está inválida ou expirada. Fale com o suporte.',
        502,
        'CREDIT_BUREAU_AUTH_FAILED',
      );
    case 403:
      return new AssertivaError(
        'O contrato com o bureau não libera esta consulta. Fale com o suporte.',
        502,
        'CREDIT_BUREAU_FORBIDDEN',
      );
    case 404:
      return new AssertivaNoData('Documento não localizado na base do bureau.');
    case 422:
      // Cobre "limite do grupo foi atingido" - teto do CONTRATO com o bureau,
      // diferente da franquia do plano que já barramos antes de chegar aqui.
      return new AssertivaError(
        message ?? 'O bureau recusou a consulta pelas regras do contrato atual.',
        502,
        'CREDIT_BUREAU_REJECTED',
      );
    case 429:
      return new AssertivaError(
        'Esta mesma consulta já está em andamento. Aguarde alguns instantes e tente de novo.',
        429,
        'CREDIT_BUREAU_IN_PROGRESS',
      );
    default:
      return new AssertivaError(
        'O bureau de crédito está instável no momento. Tente novamente em instantes.',
        502,
        'CREDIT_BUREAU_UNAVAILABLE',
      );
  }
}

/**
 * GET autenticado. `documentForLog` entra mascarado no log - o path carrega o
 * documento em claro e por isso nunca é logado inteiro.
 */
export async function assertivaGet<T>(
  path: string,
  query: Record<string, string | undefined>,
  documentForLog: string,
): Promise<T> {
  const url = new URL(env.credit.assertiva.baseUrl + path);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${await token()}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    logger.error('bureau de crédito não respondeu', {
      document: maskDocument(documentForLog),
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new AssertivaError(
      'O bureau de crédito não respondeu a tempo. Tente novamente em instantes.',
      504,
      'CREDIT_BUREAU_TIMEOUT',
    );
  }

  const body = (await response.json().catch(() => ({}))) as { message?: string } & T;

  if (!response.ok) {
    logger.warn('bureau de crédito recusou a consulta', {
      status: response.status,
      document: maskDocument(documentForLog),
      ms: Date.now() - started,
      message: body?.message,
    });
    // 401 pode ser token vencido entre a renovação e o uso: invalida o cache
    // para que a próxima tentativa não repita o mesmo token morto.
    if (response.status === 401) cached = null;
    throw describe(response.status, body?.message);
  }

  // 202 = "sem dado para exibir". Vem com 2xx e sem laudo; se passasse adiante,
  // viraria relatório com score 0 e "nenhuma restrição" - o pior resultado
  // possível: um laudo falso que parece bom.
  if (response.status === 202) {
    logger.info('bureau sem dados para o documento', {
      document: maskDocument(documentForLog),
      message: body?.message,
    });
    throw new AssertivaNoData(body?.message ?? 'O bureau não tem dados para este documento.');
  }

  logger.info('consulta ao bureau concluída', {
    document: maskDocument(documentForLog),
    ms: Date.now() - started,
  });
  return body;
}

/** Só para teste manual/health-check: derruba o token em cache. */
export function resetAssertivaToken() {
  cached = null;
  inflight = null;
}
