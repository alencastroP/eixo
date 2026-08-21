import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { tokenStore, type Session } from '../api/client';
import { authApi, trialApi, type TrialSignupInput } from '../api/endpoints';
import type { Permission, PublicUser } from '../types';

interface AuthContextValue {
  user: PublicUser | null;
  initializing: boolean;
  /**
   * O usuário tem alguma das permissões pedidas?
   *
   * Serve para a tela não OFERECER o que já se sabe que o servidor vai negar -
   * não é controle de acesso. Toda rota é barrada de novo no back-end; aqui é
   * só a diferença entre um menu escondido e um 403 na cara do usuário.
   */
  can(...permissions: Permission[]): boolean;
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
    // que a resposta de login/signup não inclui - habilita banner e bloqueio.
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

  const can = useCallback(
    (...permissions: Permission[]) => {
      // `permissions` só chega em /auth/me. Enquanto a sessão persistida não é
      // revalidada, nada é liberado: esconder demais por um instante é melhor
      // que piscar um menu que o usuário não pode usar.
      const granted = user?.permissions;
      return !!granted && permissions.some((p) => granted.includes(p));
    },
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, initializing, can, login, signupTrial, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
