import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  BarChartIcon,
  CarIcon,
  GaugeIcon,
  GridIcon,
  InboxIcon,
  LogoutIcon,
  MoonIcon,
  MoreIcon,
  SettingsIcon,
  ShieldIcon,
  SunIcon,
  UserIcon,
  WalletIcon,
} from './icons';
import { ADMIN_ROUTES } from '../pages/AdminPage';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { ROLE_LABELS } from '../types';
import { avatarColor, initials } from '../utils/format';

interface Item {
  to: string;
  label: string;
  icon: ReactNode;
  admin?: boolean;
}

/** Os destinos que cabem na barra - o resto vai para "Mais". */
const PRIMARY: Item[] = [
  { to: '/dashboard', label: 'Painel', icon: <GaugeIcon size={20} /> },
  { to: '/tickets', label: 'Atendimento', icon: <InboxIcon size={20} /> },
  { to: '/inventory', label: 'Estoque', icon: <CarIcon size={20} /> },
  { to: '/credit', label: 'Crédito', icon: <ShieldIcon size={20} /> },
];

/** Tudo que o rail lateral oferece e não coube nos 5 alvos da barra. */
const SECONDARY: Item[] = [
  { to: '/finance', label: 'Financeiro', icon: <WalletIcon size={20} />, admin: true },
  { to: '/reports', label: 'Relatórios', icon: <BarChartIcon size={20} />, admin: true },
  { to: '/admin', label: 'Administração', icon: <GridIcon size={20} />, admin: true },
  { to: '/profile', label: 'Meus dados', icon: <UserIcon size={20} /> },
  { to: '/settings', label: 'Configurações', icon: <SettingsIcon size={20} />, admin: true },
];

/**
 * Barra inferior do celular: 5 alvos de 44px e uma folha "Mais" com o resto.
 * Só aparece abaixo de 880px - o rail lateral some no mesmo ponto, então a
 * folha precisa cobrir tudo que ele oferecia, inclusive encerrar a sessão.
 */
export function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // navegar fecha a folha; o botão voltar do navegador também
  useEffect(() => setSheetOpen(false), [pathname]);

  // trava a rolagem de fundo enquanto a folha está aberta
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheetOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  const extra = SECONDARY.filter((i) => !i.admin || isAdmin);
  // as telas da central abrem por dentro de "Administração" e não têm item próprio
  const covers = (item: Item) =>
    pathname.startsWith(item.to) || (item.to === '/admin' && ADMIN_ROUTES.some((p) => pathname.startsWith(p)));
  const inSheet = extra.some(covers);

  const clearSession = async () => {
    setSheetOpen(false);
    await logout();
    localStorage.clear();
    sessionStorage.clear();
    navigate('/login');
  };

  return (
    <>
      <nav className="mobile-nav" aria-label="Navegação principal">
        {PRIMARY.map((item) => {
          // O Kanban não tem botão próprio (é o dropdown dentro da Caixa de
          // entrada), mas o botão "Atendimento" continua aceso nele.
          const active =
            item.to === '/tickets'
              ? pathname.startsWith('/tickets') || pathname.startsWith('/kanban')
              : pathname.startsWith(item.to);
          return (
            <NavLink key={item.to} to={item.to} className={() => `mobile-nav-btn ${active ? 'active' : ''}`}>
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          );
        })}
        <button
          type="button"
          className={`mobile-nav-btn ${inSheet || sheetOpen ? 'active' : ''}`}
          onClick={() => setSheetOpen((v) => !v)}
          aria-expanded={sheetOpen}
        >
          <MoreIcon size={20} />
          <span>Mais</span>
        </button>
      </nav>

      {sheetOpen && (
        <div
          className="mobile-nav-sheet"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSheetOpen(false);
          }}
        >
          <div className="mobile-nav-sheet-body">
            {user && (
              <div className="mobile-nav-sheet-user">
                <span className="avatar" style={{ backgroundColor: avatarColor(user.name) }}>
                  {initials(user.name)}
                </span>
                <div>
                  <strong>{user.name}</strong>
                  <span className="muted small">
                    {user.email} · {ROLE_LABELS[user.role]}
                  </span>
                </div>
              </div>
            )}

            <div className="mobile-nav-sheet-grid">
              {extra.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `mobile-nav-sheet-item ${isActive || covers(item) ? 'active' : ''}`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
              ))}
              <button type="button" className="mobile-nav-sheet-item" onClick={toggle}>
                {theme === 'dark' ? <SunIcon size={20} /> : <MoonIcon size={20} />}
                <span>{theme === 'dark' ? 'Modo claro' : 'Modo escuro'}</span>
              </button>
              <button type="button" className="mobile-nav-sheet-item danger" onClick={clearSession}>
                <LogoutIcon size={20} />
                <span>Limpar sessão</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
