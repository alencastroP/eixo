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
