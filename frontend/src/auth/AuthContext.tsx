import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { tokenStore, type Session } from '../api/client';
import { authApi, trialApi, type TrialSignupInput } from '../api/endpoints';
import type { PublicUser } from '../types';

interface AuthContextValue {
  user: PublicUser | null;
  initializing: boolean;
  login(email: string, password: string): Promise<void>;
  signupTrial(input: TrialSignupInput): Promise<void>;
  logout(): Promise<void>;
  refreshUser(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(() => tokenStore.getUser());
  const [initializing, setInitializing] = useState(true);

  // Valida a sessão persistida ao abrir o app (client renova o token se preciso).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tokenStore.getAccess()) {
        setInitializing(false);
        return;
      }
      try {
        const me = await authApi.me();
        if (!cancelled) setUser(me);
      } catch {
        tokenStore.clear();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sessão irrecuperável (refresh falhou) → volta para o login.
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('crm:unauthorized', onUnauthorized);
    return () => window.removeEventListener('crm:unauthorized', onUnauthorized);
  }, []);

  const establish = useCallback(async (session: Session) => {
    tokenStore.save(session);
    // enriquece com /me para trazer os dados da conta (status/dias de trial),
    // que a resposta de login/signup não inclui — habilita banner e bloqueio.
    try {
      setUser(await authApi.me());
    } catch {
      setUser(session.user);
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string) => establish(await authApi.login(email, password)),
    [establish],
  );

  const signupTrial = useCallback(
    async (input: TrialSignupInput) => establish(await trialApi.signup(input)),
    [establish],
  );

  const refreshUser = useCallback(async () => {
    const me = await authApi.me();
    setUser(me);
    const saved = tokenStore.getUser();
    if (saved) tokenStore.save({ accessToken: tokenStore.getAccess()!, refreshToken: tokenStore.getRefresh()!, user: me });
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = tokenStore.getRefresh();
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        /* revogação é melhor esforço */
      }
    }
    tokenStore.clear();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, initializing, login, signupTrial, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
