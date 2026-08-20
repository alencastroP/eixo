import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedLayout } from './components/Layout';
import { AdminRoute } from './components/AdminRoute';
import { CompanyPage } from './pages/CompanyPage';
import { CreditPage } from './pages/CreditPage';
import { DashboardPage } from './pages/DashboardPage';
import { FinancePage } from './pages/FinancePage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { StorefrontConfigPage } from './pages/StorefrontConfigPage';
import { UsersPage } from './pages/UsersPage';
import { InboxPage } from './pages/InboxPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { InventoryPage } from './pages/InventoryPage';
import { KanbanPage } from './pages/KanbanPage';
import { AuditPage } from './pages/AuditPage';
import { LoginPage } from './pages/LoginPage';
import { TrialSignupPage } from './pages/TrialSignupPage';
import { VehicleFormPage } from './pages/VehicleFormPage';
import { slugFromHostname } from './storefront/resolveSlug';

// Relatórios/BI carrega o Recharts (pesado) — code-split para não inflar o bundle inicial.
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));

// A vitrine pública tem CSS e componentes próprios, que nenhum usuário do CRM
// baixa — por isso entra em chunk separado, como os relatórios.
const StorefrontLayout = lazy(() =>
  import('./storefront/StorefrontLayout').then((m) => ({ default: m.StorefrontLayout })),
);
const StorefrontHome = lazy(() => import('./storefront/HomePage').then((m) => ({ default: m.HomePage })));
const StorefrontVehicle = lazy(() => import('./storefront/VehiclePage').then((m) => ({ default: m.VehiclePage })));

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
        </Route>
      )}

      <Route path="/login" element={<LoginPage />} />
      <Route path="/trial" element={<TrialSignupPage />} />
      <Route element={<ProtectedLayout />}>
        {/* no subdomínio de uma loja a raiz é a vitrine (rota acima), não o painel */}
        {!hostSlug && <Route path="/" element={<Navigate to="/dashboard" replace />} />}
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tickets" element={<InboxPage />} />
        <Route path="/tickets/:id" element={<InboxPage />} />
        <Route path="/kanban" element={<KanbanPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route
          path="/inventory/new"
          element={
            <AdminRoute>
              <VehicleFormPage />
            </AdminRoute>
          }
        />
        <Route path="/inventory/:id/edit" element={<VehicleFormPage />} />
        <Route path="/credit" element={<CreditPage />} />
        <Route
          path="/finance"
          element={
            <AdminRoute>
              <FinancePage />
            </AdminRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <AdminRoute>
              <Suspense fallback={<div className="dash-loading">Carregando relatórios…</div>}>
                <ReportsPage />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route
          path="/audit"
          element={
            <AdminRoute>
              <AuditPage />
            </AdminRoute>
          }
        />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/company" element={<CompanyPage />} />
        <Route
          path="/users"
          element={
            <AdminRoute>
              <UsersPage />
            </AdminRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <AdminRoute>
              <SettingsPage />
            </AdminRoute>
          }
        />
        <Route
          path="/storefront"
          element={
            <AdminRoute>
              <StorefrontConfigPage />
            </AdminRoute>
          }
        />
        <Route
          path="/integrations"
          element={
            <AdminRoute>
              <IntegrationsPage />
            </AdminRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to={hostSlug ? '/' : '/dashboard'} replace />} />
    </Routes>
  );
}
