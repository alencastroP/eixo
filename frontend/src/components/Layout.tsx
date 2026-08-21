import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { BrandLogo, BrandMark } from './BrandMark';
import { MobileNav } from './MobileNav';
import { TrialBanner, AccountBlocked } from './TrialBanner';
import { UserMenu } from './UserMenu';
import { ADMIN_PERMISSIONS, ADMIN_ROUTES } from '../pages/AdminPage';
import {
  BarChartIcon,
  CarIcon,
  GaugeIcon,
  GridIcon,
  InboxIcon,
  MoonIcon,
  ShieldIcon,
  SunIcon,
  WalletIcon,
} from './icons';

/**
 * Shell "cockpit": rail estreito de ícones à esquerda, conteúdo ocupa o resto.
 *
 * Cada alvo do rail depende da permissão do módulo que ele abre - o perfil de
 * cada pessoa desenha a própria barra. Quem só atende vê três botões; quem
 * administra a loja vê todos.
 */
export function ProtectedLayout() {
  const { user, initializing, can } = useAuth();
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();
  // as telas da central não têm alvo próprio no rail: o botão dela fica aceso
  const inAdmin = ADMIN_ROUTES.some((p) => pathname.startsWith(p));
  // Kanban não tem botão próprio: é um submódulo acessado pelo dropdown dentro
  // da Caixa de entrada - mas o rail continua aceso nas duas rotas.
  const inTickets = pathname.startsWith('/tickets') || pathname.startsWith('/kanban');

  if (initializing) {
    return (
      <div className="splash">
        <BrandLogo tone="onDark" size={40} className="splash-mark dark-only" />
        <BrandLogo tone="onLight" size={40} className="splash-mark light-only" />
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
        <div className="rail-logo" title="Eixo">
          {/* ladrilho laranja: a marca sai vazada em branco, como na versão de
              fundo escuro da identidade */}
          <BrandMark variant="white" size={18} />
        </div>
        <NavLink to="/dashboard" className={({ isActive }) => `rail-btn ${isActive ? 'active' : ''}`} title="Painel">
          <GaugeIcon />
        </NavLink>
        {can('tickets.view') && (
          <NavLink
            to="/tickets"
            className={() => `rail-btn ${inTickets ? 'active' : ''}`}
            title="Caixa de entrada"
          >
            <InboxIcon />
          </NavLink>
        )}
        {can('vehicles.view') && (
          <NavLink to="/inventory" className={({ isActive }) => `rail-btn ${isActive ? 'active' : ''}`} title="Estoque">
            <CarIcon />
          </NavLink>
        )}
        {can('credit.view') && (
          <NavLink to="/credit" className={({ isActive }) => `rail-btn ${isActive ? 'active' : ''}`} title="Análise de Crédito">
            <ShieldIcon />
          </NavLink>
        )}
        {can('finance.view', 'fiscal.view') && (
          <NavLink
            to="/finance"
            className={({ isActive }) => `rail-btn ${isActive ? 'active' : ''}`}
            title="Administrativo & Fiscal"
          >
            <WalletIcon />
          </NavLink>
        )}
        {can('reports.view') && (
          <NavLink
            to="/reports"
            className={({ isActive }) => `rail-btn ${isActive ? 'active' : ''}`}
            title="Relatórios & BI"
          >
            <BarChartIcon />
          </NavLink>
        )}
        {can(...ADMIN_PERMISSIONS) && (
          <NavLink
            to="/admin"
            className={({ isActive }) => `rail-btn ${isActive || inAdmin ? 'active' : ''}`}
            title="Administração"
          >
            <GridIcon />
          </NavLink>
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
      <MobileNav />
    </div>
  );
}
