import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { BrandMark } from './BrandMark';
import { TrialBanner, AccountBlocked } from './TrialBanner';
import { UserMenu } from './UserMenu';
import {
  BarChartIcon,
  CarIcon,
  ColumnsIcon,
  GaugeIcon,
  HistoryIcon,
  InboxIcon,
  MoonIcon,
  PlugIcon,
  ShieldIcon,
  SunIcon,
  WalletIcon,
} from './icons';

/** Shell "cockpit": rail estreito de ícones à esquerda, conteúdo ocupa o resto. */
export function ProtectedLayout() {
  const { user, initializing } = useAuth();
  const { theme, toggle } = useTheme();

  if (initializing) {
    return (
      <div className="splash">
        <BrandMark variant="white" size={40} glow className="splash-mark dark-only" />
        <BrandMark variant="asphalt" size={40} className="splash-mark light-only" />
        <p>Carregando…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  // Conta bloqueada (trial expirado / inadimplente): tela de bloqueio, dados preservados.
  const status = user.account?.status;
  if (status && status !== 'TRIAL' && status !== 'ACTIVE') {
    return <AccountBlocked user={user} />;
  }

  return (
    <div className="app-shell">
      <nav className="rail">
        <div className="rail-logo" title="CRM Auto — Atendimento">
          <BrandMark variant="orange" size={20} glow />
        </div>
        <NavLink to="/dashboard" className={({ isActive }) => `rail-btn ${isActive ? 'active' : ''}`} title="Painel">
          <GaugeIcon />
        </NavLink>
        <NavLink
          to="/tickets"
          className={({ isActive }) => `rail-btn ${isActive ? 'active' : ''}`}
          title="Caixa de entrada"
        >
          <InboxIcon />
        </NavLink>
        <NavLink to="/kanban" className={({ isActive }) => `rail-btn ${isActive ? 'active' : ''}`} title="Kanban">
          <ColumnsIcon />
        </NavLink>
        <NavLink to="/inventory" className={({ isActive }) => `rail-btn ${isActive ? 'active' : ''}`} title="Estoque">
          <CarIcon />
        </NavLink>
        <NavLink to="/credit" className={({ isActive }) => `rail-btn ${isActive ? 'active' : ''}`} title="Análise de Crédito">
          <ShieldIcon />
        </NavLink>
        {user.role === 'ADMIN' && (
          <>
            <NavLink
              to="/finance"
              className={({ isActive }) => `rail-btn ${isActive ? 'active' : ''}`}
              title="Administrativo & Fiscal"
            >
              <WalletIcon />
            </NavLink>
            <NavLink
              to="/reports"
              className={({ isActive }) => `rail-btn ${isActive ? 'active' : ''}`}
              title="Relatórios & BI"
            >
              <BarChartIcon />
            </NavLink>
            <NavLink
              to="/audit"
              className={({ isActive }) => `rail-btn ${isActive ? 'active' : ''}`}
              title="Trilha de Auditoria"
            >
              <HistoryIcon />
            </NavLink>
            <NavLink
              to="/integrations"
              className={({ isActive }) => `rail-btn ${isActive ? 'active' : ''}`}
              title="Integrações"
            >
              <PlugIcon />
            </NavLink>
          </>
        )}
        <div className="rail-spacer" />
        <button className="rail-btn" onClick={toggle} title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}>
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        <UserMenu />
      </nav>
      <div className="app-content">
        <TrialBanner account={user.account} />
        <Outlet />
      </div>
    </div>
  );
}
