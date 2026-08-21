import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { CoinsIcon, ReceiptIcon, WalletIcon } from '../components/icons';
import { CashFlowTab } from './finance/CashFlowTab';
import { FiscalTab } from './finance/FiscalTab';
import { VehicleExpensesTab } from './finance/VehicleExpensesTab';
import type { Permission } from '../types';

type Tab = 'cashflow' | 'fiscal' | 'expenses';

/**
 * Caixa, notas e custo do estoque são permissões distintas: o contador da loja
 * pode emitir nota sem enxergar a margem de cada carro. A aba só existe para
 * quem tem o que ela mostra.
 */
const TABS: Array<{ key: Tab; label: string; icon: JSX.Element; permission: Permission }> = [
  { key: 'cashflow', label: 'Fluxo de Caixa', icon: <WalletIcon size={16} />, permission: 'finance.view' },
  { key: 'fiscal', label: 'Faturamento Fiscal', icon: <ReceiptIcon size={16} />, permission: 'fiscal.view' },
  { key: 'expenses', label: 'Despesas por Veículo', icon: <CoinsIcon size={16} />, permission: 'vehicles.costs' },
];

export function FinancePage() {
  const { can } = useAuth();
  const tabs = TABS.filter((t) => can(t.permission));
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? 'cashflow');

  return (
    <div className="dash finance-page">
      <PageHeader
        icon={<WalletIcon size={19} />}
        eyebrow="Administrativo & Fiscal"
        title="Centro Financeiro"
        subtitle="Fluxo de caixa, emissão de notas e custo real do estoque."
      />

      <div className="tab-nav">
        {tabs.map((t) => (
          <button key={t.key} className={`tab-btn ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'cashflow' && can('finance.view') && <CashFlowTab />}
      {tab === 'fiscal' && can('fiscal.view') && <FiscalTab />}
      {tab === 'expenses' && can('vehicles.costs') && <VehicleExpensesTab />}
    </div>
  );
}
