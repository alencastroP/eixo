import type { Paged } from '../types';
import type {
  ChatInput,
  ChatReply,
  SiteLeadInput,
  SitePayload,
  SiteVehicle,
  SiteVehicleDetail,
  SiteVehicleQuery,
} from './types';

/**
 * Cliente HTTP da vitrine. Deliberadamente separado de api/client.ts: aqui não
 * existe sessão, token nem refresh — o visitante é anônimo, e um 401 do CRM
 * jamais deve derrubar (ou tentar renovar) nada nesta página.
 */
const BASE = import.meta.env.VITE_API_URL ?? '/api';

export class SiteError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'SiteError';
  }
}

type Query = Record<string, string | number | undefined>;

async function get<T>(path: string, query?: Query): Promise<T> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  const res = await fetch(`${BASE}/site${path}${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new SiteError(res.status, await errorMessage(res));
  return (await res.json()) as T;
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data.error?.message ?? `Erro ${res.status}`;
  } catch {
    return `Erro ${res.status}`;
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/site${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new SiteError(res.status, await errorMessage(res));
  return (await res.json()) as T;
}

export const siteApi = {
  site: (slug: string) => get<SitePayload>(`/${slug}`),
  vehicles: (slug: string, query: SiteVehicleQuery) => get<Paged<SiteVehicle>>(`/${slug}/vehicles`, query as Query),
  vehicle: (slug: string, id: string) => get<SiteVehicleDetail>(`/${slug}/vehicles/${id}`),

  /** Conversa com o Agente de Pré-Venda IA (cria/continua um ticket no CRM). */
  chat: (slug: string, input: ChatInput) => post<ChatReply>(`/${slug}/chat`, input),

  async lead(slug: string, input: SiteLeadInput): Promise<void> {
    const res = await fetch(`${BASE}/site/${slug}/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new SiteError(res.status, await errorMessage(res));
  },
};
