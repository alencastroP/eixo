import type { PublicUser } from '../types';

const BASE = import.meta.env.VITE_API_URL ?? '/api';

const KEYS = {
  access: 'crm.accessToken',
  refresh: 'crm.refreshToken',
  user: 'crm.user',
} as const;

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

export const tokenStore = {
  getAccess: () => localStorage.getItem(KEYS.access),
  getRefresh: () => localStorage.getItem(KEYS.refresh),
  getUser(): PublicUser | null {
    try {
      const raw = localStorage.getItem(KEYS.user);
      return raw ? (JSON.parse(raw) as PublicUser) : null;
    } catch {
      return null;
    }
  },
  save(session: Session) {
    localStorage.setItem(KEYS.access, session.accessToken);
    localStorage.setItem(KEYS.refresh, session.refreshToken);
    localStorage.setItem(KEYS.user, JSON.stringify(session.user));
  },
  clear() {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  },
};

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
