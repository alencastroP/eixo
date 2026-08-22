import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedLayout } from './components/Layout';
import { RequirePermission } from './components/RequirePermission';
import { AgentConfigPage } from './pages/AgentConfigPage';
import { ADMIN_PERMISSIONS, AdminPage } from './pages/AdminPage';
import { BillingPage } from './pages/BillingPage';
import { CompanyPage } from './pages/CompanyPage';
import { CreditPage } from './pages/CreditPage';
import { DashboardPage } from './pages/DashboardPage';
import { FinancePage } from './pages/FinancePage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { StorefrontConfigPage } from './pages/StorefrontConfigPage';
import { UsersPage } from './pages/UsersPage';
import { RolesPage } from './pages/RolesPage';
import { InboxPage } from './pages/InboxPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { InventoryPage } from './pages/InventoryPage';
import { KanbanPage } from './pages/KanbanPage';
import { AuditPage } from './pages/AuditPage';
import { LoginPage } from './pages/LoginPage';
import { PlatformPage } from './pages/PlatformPage';
import { RequirePlatformAdmin } from './components/RequirePermission';
import { TrialSignupPage } from './pages/TrialSignupPage';
import { VehicleFormPage } from './pages/VehicleFormPage';
import { slugFromHostname } from './storefront/resolveSlug';

// Relatórios/BI carrega o Recharts (pesado) - code-split para não inflar o bundle inicial.
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));

// A vitrine pública tem CSS e componentes próprios, que nenhum usuário do CRM
// baixa - por isso entra em chunk separado, como os relatórios.
const StorefrontLayout = lazy(() =>
  import('./storefront/StorefrontLayout').then((m) => ({ default: m.StorefrontLayout })),
);
const StorefrontHome = lazy(() => import('./storefront/HomePage').then((m) => ({ default: m.HomePage })));
const StorefrontVehicle = lazy(() => import('./storefront/VehiclePage').then((m) => ({ default: m.VehiclePage })));
const StorefrontAbout = lazy(() => import('./storefront/AboutPage').then((m) => ({ default: m.AboutPage })));

// Landing pública (eixocrm.com) - separada do resto porque ninguém logado a baixa.
const LandingPage = lazy(() => import('./pages/LandingPage').then((m) => ({ default: m.LandingPage })));
const LegalIndexPage = lazy(() => import('./pages/LegalPage').then((m) => ({ default: m.LegalIndexPage })));
const LegalDocPage = lazy(() => import('./pages/LegalPage').then((m) => ({ default: m.LegalDocPage })));

const storefrontFallback = <div className="page-loading">Carregando…</div>;

export default function App() {
  // Em produção cada loja tem seu subdomínio; nesse caso a raiz do site é a
  // vitrine, não o painel. Em dev/preview o caminho /loja/:slug faz o mesmo.
  const hostSlug = slugFromHostname();

  return (
    <Routes>
      <Route
        path="/loja/:slug"
        element={
          <Suspense fallback={storefrontFallback}>
            <StorefrontLayout />
          </Suspense>
        }
      >
        <Route index element={<StorefrontHome />} />
        <Route path="veiculo/:id" element={<StorefrontVehicle />} />
        <Route path="quem-somos" element={<StorefrontAbout />} />
      </Route>

      {hostSlug && (
        <Route
          path="/"
          element={
            <Suspense fallback={storefrontFallback}>
              <StorefrontLayout />
            </Suspense>
          }
        >
          <Route index element={<StorefrontHome />} />
          <Route path="veiculo/:id" element={<StorefrontVehicle />} />
          <Route path="quem-somos" element={<StorefrontAbout />} />
        </Route>
      )}

      {/* no subdomínio de uma loja a raiz é a vitrine (rota acima); fora dela é a landing pública */}
      {!hostSlug && (
        <Route
          path="/"
          element={
            <Suspense fallback={storefrontFallback}>
              <LandingPage />
            </Suspense>
          }
        />
      )}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/trial" element={<TrialSignupPage />} />
      <Route
        path="/legal"
        element={
          <Suspense fallback={storefrontFallback}>
            <LegalIndexPage />
          </Suspense>
        }
      />
      <Route
        path="/legal/:slug"
        element={
          <Suspense fallback={storefrontFallback}>
            <LegalDocPage />
          </Suspense>
        }
      />
      <Route element={<ProtectedLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route
          path="/tickets"
          element={
            <RequirePermission permission="tickets.view">
              <InboxPage />
            </RequirePermission>
          }
        />
        <Route
          path="/tickets/:id"
          element={
            <RequirePermission permission="tickets.view">
              <InboxPage />
            </RequirePermission>
          }
        />
        <Route
          path="/kanban"
          element={
            <RequirePermission permission="tickets.view">
              <KanbanPage />
            </RequirePermission>
          }
        />
        <Route
          path="/inventory"
          element={
            <RequirePermission permission="vehicles.view">
              <InventoryPage />
            </RequirePermission>
          }
        />
        <Route
          path="/inventory/new"
          element={
            <RequirePermission permission="vehicles.manage">
              <VehicleFormPage />
            </RequirePermission>
          }
        />
        {/* a ficha abre para quem vê o estoque; sem 'vehicles.manage' os
            campos ficam travados dentro da própria página */}
        <Route
          path="/inventory/:id/edit"
          element={
            <RequirePermission permission="vehicles.view">
              <VehicleFormPage />
            </RequirePermission>
          }
        />
        <Route
          path="/credit"
          element={
            <RequirePermission permission="credit.view">
              <CreditPage />
            </RequirePermission>
          }
        />
        <Route
          path="/finance"
          element={
            <RequirePermission permission={['finance.view', 'fiscal.view', 'vehicles.costs']}>
              <FinancePage />
            </RequirePermission>
          }
        />
        <Route
          path="/reports"
          element={
            <RequirePermission permission="reports.view">
              <Suspense fallback={<div className="dash-loading">Carregando relatórios…</div>}>
                <ReportsPage />
              </Suspense>
            </RequirePermission>
          }
        />
        <Route
          path="/audit"
          element={
            <RequirePermission permission="audit.view">
              <AuditPage />
            </RequirePermission>
          }
        />
        <Route path="/profile" element={<ProfilePage />} />
        <Route
          path="/admin"
          element={
            // a central lista o que o perfil alcança; basta administrar UMA
            // coisa para ela fazer sentido
            <RequirePermission permission={ADMIN_PERMISSIONS}>
              <AdminPage />
            </RequirePermission>
          }
        />
        <Route
          path="/company"
          element={
            <RequirePermission permission="company.manage">
              <CompanyPage />
            </RequirePermission>
          }
        />
        <Route
          path="/billing"
          element={
            <RequirePermission permission="billing.view">
              <BillingPage />
            </RequirePermission>
          }
        />
        <Route
          path="/users"
          element={
            <RequirePermission permission="users.manage">
              <UsersPage />
            </RequirePermission>
          }
        />
        <Route
          path="/roles"
          element={
            <RequirePermission permission="profiles.manage">
              <RolesPage />
            </RequirePermission>
          }
        />
        <Route
          path="/settings"
          element={
            <RequirePermission permission="company.manage">
              <SettingsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/storefront"
          element={
            <RequirePermission permission="storefront.manage">
              <StorefrontConfigPage />
            </RequirePermission>
          }
        />
        <Route
          path="/agent"
          element={
            <RequirePermission permission="agent.manage">
              <AgentConfigPage />
            </RequirePermission>
          }
        />
        <Route
          path="/integrations"
          element={
            <RequirePermission permission="integrations.manage">
              <IntegrationsPage />
            </RequirePermission>
          }
        />
        <Route
          path="/platform"
          element={
            <RequirePlatformAdmin>
              <PlatformPage />
            </RequirePlatformAdmin>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to={hostSlug ? '/' : '/dashboard'} replace />} />
    </Routes>
  );
}
