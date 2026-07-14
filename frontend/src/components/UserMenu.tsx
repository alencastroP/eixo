import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS } from '../types';
import { avatarColor, initials } from '../utils/format';
import { BuildingIcon, LogoutIcon, SettingsIcon, UserIcon, UsersIcon } from './icons';

/** Dropdown do avatar (rail): perfil, empresa, usuários (admin) e limpar sessão. */
export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  /** Limpa cache local da sessão, faz logout e volta ao login. */
  const clearSession = async () => {
    setOpen(false);
    await logout();
    localStorage.clear();
    sessionStorage.clear();
    navigate('/login');
  };

  return (
    <div className="user-menu" ref={ref}>
      <button
        className="avatar rail-avatar user-menu-trigger"
        style={{ backgroundColor: avatarColor(user.name) }}
        title="Menu do usuário"
        onClick={() => setOpen((v) => !v)}
      >
        {initials(user.name)}
      </button>

      {open && (
        <div className="user-menu-pop" role="menu">
          <div className="user-menu-head">
            <span className="avatar" style={{ backgroundColor: avatarColor(user.name) }}>
              {initials(user.name)}
            </span>
            <div className="user-menu-id">
              <strong>{user.name}</strong>
              <span className="muted small">
                {user.email} · {ROLE_LABELS[user.role]}
              </span>
            </div>
          </div>

          <div className="user-menu-items">
            <button className="user-menu-item" onClick={() => go('/profile')}>
              <UserIcon size={16} /> Meus Dados
            </button>
            <button className="user-menu-item" onClick={() => go('/company')}>
              <BuildingIcon size={16} /> Dados da Empresa
            </button>
            {user.role === 'ADMIN' && (
              <>
                <button className="user-menu-item" onClick={() => go('/users')}>
                  <UsersIcon size={16} /> Gerenciar Usuários
                </button>
                <button className="user-menu-item" onClick={() => go('/settings')}>
                  <SettingsIcon size={16} /> Configurações
                </button>
              </>
            )}
          </div>

          <div className="user-menu-divider" />

          <button className="user-menu-item danger" onClick={clearSession}>
            <LogoutIcon size={16} /> Limpar Dados de Navegação
          </button>
        </div>
      )}
    </div>
  );
}
