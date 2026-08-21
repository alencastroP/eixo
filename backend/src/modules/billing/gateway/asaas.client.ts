/**
 * Cliente HTTP do Asaas (API v3).
 *
 * Responsabilidade única: falar HTTP com o Asaas e transformar falha dele em
 * erro nosso. Nenhuma regra de negócio mora aqui - a tradução dos formatos
 * está em asaas.gateway.ts.
 *
 * Três cuidados que não são óbvios:
 *
 *  1. `access_token` vai no HEADER, nunca na URL - query string vaza em log de
 *     proxy e histórico. A chave também nunca é logada (o logger já redige
 *     chaves com "token"/"key", mas aqui nem chegamos a passá-la adiante).
 *  2. Timeout explícito via AbortSignal. Sem ele, uma indisponibilidade do
 *     gateway vira requisição pendurada e, no fim, thread do Express parada
 *     esperando um pagamento que nunca responde.
 *  3. O corpo de erro do Asaas (`{ errors: [{ code, description }] }`) é
 *     traduzido para a mensagem que o lojista lê. Devolver "Erro 400" numa
 *     tela de assinatura é jogar o problema no colo de quem não pode resolvê-lo.
 */
import { env } from '../../../config/env';
import { AppError } from '../../../lib/errors';
import { logger } from '../../../lib/logger';

const BASE_URL = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  production: 'https://api.asaas.com/v3',
} as const;

const TIMEOUT_MS = 20_000;

export class AsaasError extends AppError {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly gatewayCode?: string,
  ) {
    // 502: a falha é do gateway, não do cliente que chamou a nossa API. As
    // exceções (400 de validação) são remapeadas abaixo, em `describe`.
    super(httpStatus === 400 ? 400 : 502, message, 'BILLING_GATEWAY_ERROR');
  }
}

interface AsaasErrorBody {
  errors?: { code?: string; description?: string }[];
}

/** Extrai a primeira descrição legível do corpo de erro do Asaas. */
function describe(body: unknown, status: number): { message: string; code?: string } {
  const first = (body as AsaasErrorBody)?.errors?.[0];
  if (first?.description) return { message: first.description, code: first.code };
  if (status === 401) return { message: 'Credencial do gateway de pagamento inválida ou expirada.' };
  if (status === 404) return { message: 'Registro não encontrado no gateway de pagamento.' };
  return { message: 'O gateway de pagamento não concluiu a operação. Tente novamente em instantes.' };
}

export interface AsaasPage<T> {
  data: T[];
  hasMore: boolean;
  totalCount: number;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options: { body?: unknown; query?: Record<string, string | number | undefined> } = {},
): Promise<T> {
  const { apiKey, mode } = env.billing.asaas;
  if (!apiKey) {
    throw new AppError(503, 'Gateway de pagamento não configurado nesta instalação.', 'BILLING_UNAVAILABLE');
  }

  const url = new URL(BASE_URL[mode as keyof typeof BASE_URL] + path);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        access_token: apiKey,
        'Content-Type': 'application/json',
        // O Asaas exige um User-Agent identificável; requisições anônimas são
        // barradas pela proteção de borda dele.
        'User-Agent': 'Eixo-CRM/1.0',
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    logger.error('asaas: falha de rede', { method, path, err });
    throw new AsaasError('Não foi possível falar com o gateway de pagamento.', 502);
  }

  const text = await response.text();
  const parsed: unknown = text ? safeJson(text) : null;

  logger.info('asaas: chamada concluída', {
    method,
    path,
    status: response.status,
    ms: Date.now() - started,
  });

  if (!response.ok) {
    const { message, code } = describe(parsed, response.status);
    logger.warn('asaas: resposta de erro', { method, path, status: response.status, code });
    throw new AsaasError(message, response.status, code);
  }

  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const asaas = {
  get: <T>(path: string, query?: Record<string, string | number | undefined>) =>
    request<T>('GET', path, { query }),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, { body }),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, { body }),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/** Data no formato que o Asaas aceita em vencimentos: 'YYYY-MM-DD'. */
export function toAsaasDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Converte data do Asaas para Date.
 *
 * 'YYYY-MM-DD' é lido como MEIO-DIA UTC, não meia-noite: no fuso do Brasil
 * (UTC-3) a meia-noite UTC volta um dia no calendário, e um vencimento dia 10
 * apareceria como dia 9 na tela do lojista.
 */
export function fromAsaasDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00.000Z`);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Reais (float do Asaas) → centavos (int). */
export const toCents = (value: number | null | undefined): number => Math.round((value ?? 0) * 100);

/** Centavos (int) → reais com 2 casas, como o Asaas espera. */
export const toReais = (cents: number): number => Number((cents / 100).toFixed(2));
