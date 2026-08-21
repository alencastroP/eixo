import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { Permission } from '../types';

interface Props {
  /** Basta UMA das permissões para entrar. */
  permission: Permission | Permission[];
  children: ReactNode;
}

/**
 * Fecha uma rota a quem o perfil não autoriza, mandando de volta ao painel.
 *
 * É conveniência de navegação, não segurança: a mesma decisão já é tomada no
 * servidor, e é lá que ela vale. Aqui evitamos que o usuário chegue numa tela
 * que só saberia carregar erros.
 */
export function RequirePermission({ permission, children }: Props) {
  const { user, can } = useAuth();
  const needed = Array.isArray(permission) ? permission : [permission];
  // sem usuário, quem decide é o ProtectedLayout (manda para o login)
  if (user && !can(...needed)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/**
 * Guarda do módulo de Plataforma - não é uma permissão de perfil, é o
 * booleano rígido `isPlatformAdmin` que o servidor calcula a partir de
 * PLATFORM_ACCOUNT_ID. Mesmo aviso do `RequirePermission`: é conveniência de
 * navegação, quem barra de verdade é o `requirePlatformAccount` no servidor.
 */
export function RequirePlatformAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user && !user.isPlatformAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
