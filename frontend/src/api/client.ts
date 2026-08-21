import type { PublicUser } from '../types';

const BASE = import.meta.env.VITE_API_URL ?? '/api';

const KEYS = {
  access: 'crm.accessToken',
  refresh: 'crm.refreshToken',
  user: 'crm.user',
} as const;

/**
 * Presente (em `sessionStorage`) quando esta ABA foi aberta como sessão de
 * suporte. `sessionStorage` é isolado por aba - é por isso que uma sessão de
 * suporte nunca substitui a sessão normal do admin da plataforma no separador
 * original: cada uma vive no seu próprio armazenamento.
 */
const SUPPORT_MODE_KEY = 'crm.supportMode';

function storage(): Storage {
  return sessionStorage.getItem(SUPPORT_MODE_KEY) === '1' ? sessionStorage : localStorage;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

export const tokenStore = {
  getAccess: () => storage().getItem(KEYS.access),
  getRefresh: () => storage().getItem(KEYS.refresh),
  getUser(): PublicUser | null {
    try {
      const raw = storage().getItem(KEYS.user);
      return raw ? (JSON.parse(raw) as PublicUser) : null;
    } catch {
      return null;
    }
  },
  save(session: Session) {
    storage().setItem(KEYS.access, session.accessToken);
    storage().setItem(KEYS.refresh, session.refreshToken);
    storage().setItem(KEYS.user, JSON.stringify(session.user));
  },
  clear() {
    // limpa os dois armazenamentos e tira a aba do modo suporte - sem isso,
    // logar de novo NESTA aba depois do fim de uma sessão de suporte ficaria
    // preso no sessionStorage (perderia a sessão ao fechar a aba).
    Object.values(KEYS).forEach((k) => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
    sessionStorage.removeItem(SUPPORT_MODE_KEY);
  },
  /**
   * Sessão de suporte: só o access token (sem refresh), isolado nesta aba.
   * O `user` (nome da conta do cliente, permissões etc.) não precisa vir
   * junto - assim que o token entra no sessionStorage, o boot normal do
   * `AuthContext` chama `GET /auth/me` e resolve tudo sozinho, do mesmo jeito
   * que resolveria numa aba nova com um token qualquer já salvo.
   */
  enterSupportMode(accessToken: string) {
    sessionStorage.setItem(SUPPORT_MODE_KEY, '1');
    sessionStorage.setItem(KEYS.access, accessToken);
  },
  isSupportMode: () => sessionStorage.getItem(SUPPORT_MODE_KEY) === '1',
};

/**
 * Chamada uma vez, síncrona, ANTES do React montar (ver main.tsx). Se a aba
 * foi aberta pelo botão "Acessar como suporte" (`/support-session#token=...`),
 * grava o token no sessionStorage desta aba e troca a URL para `/dashboard`
 * ANTES do `AuthProvider` ler o storage pela primeira vez - depois desse
 * ponto seria tarde demais (o estado inicial já teria sido calculado).
 */
export function consumeSupportSessionHash(): void {
  if (location.pathname !== '/support-session') return;
  const token = new URLSearchParams(location.hash.replace(/^#/, '')).get('token');
  if (token) tokenStore.enterSupportMode(token);
  history.replaceState(null, '', '/dashboard');
}

/** Lê o `exp` (segundos, epoch) de um JWT sem verificar assinatura - só para
 *  exibir a contagem regressiva da sessão de suporte no front. */
export function decodeJwtExpiry(token: string): Date | null {
  try {
    const [, payload] = token.split('.');
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return json.exp ? new Date(json.exp * 1000) : null;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Refresh "single-flight": várias requisições 401 simultâneas disparam UMA renovação.
let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = tokenStore.getRefresh();
      if (!refreshToken) return false;
      try {
        const res = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;
        tokenStore.save((await res.json()) as Session);
        return true;
      } catch {
        return false;
      }
    })();
    void refreshInFlight.finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

function buildQuery(query?: ApiOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export async function api<T>(path: string, options: ApiOptions = {}, allowRetry = true): Promise<T> {
  const access = tokenStore.getAccess();
  const res = await fetch(`${BASE}${path}${buildQuery(options.query)}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && allowRetry && !path.startsWith('/auth/')) {
    if (await tryRefresh()) return api<T>(path, options, false);
    tokenStore.clear();
    window.dispatchEvent(new Event('crm:unauthorized'));
  }

  if (!res.ok) {
    let message = `Erro ${res.status}`;
    try {
      const data = (await res.json()) as { error?: { message?: string } };
      message = data.error?.message ?? message;
    } catch {
      /* corpo não-JSON */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
