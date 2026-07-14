import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { CoinsIcon, ReceiptIcon, WalletIcon } from '../components/icons';
import { CashFlowTab } from './finance/CashFlowTab';
import { FiscalTab } from './finance/FiscalTab';
import { VehicleExpensesTab } from './finance/VehicleExpensesTab';

type Tab = 'cashflow' | 'fiscal' | 'expenses';

const TABS: Array<{ key: Tab; label: string; icon: JSX.Element }> = [
  { key: 'cashflow', label: 'Fluxo de Caixa', icon: <WalletIcon size={16} /> },
  { key: 'fiscal', label: 'Faturamento Fiscal', icon: <ReceiptIcon size={16} /> },
  { key: 'expenses', label: 'Despesas por Veículo', icon: <CoinsIcon size={16} /> },
];

export function FinancePage() {
  const [tab, setTab] = useState<Tab>('cashflow');

  return (
    <div className="dash finance-page">
      <PageHeader
        icon={<WalletIcon size={19} />}
        eyebrow="Administrativo & Fiscal"
        title="Centro Financeiro"
        subtitle="Fluxo de caixa, emissão de notas e custo real do estoque."
      />

      <div className="tab-nav">
        {TABS.map((t) => (
          <button key={t.key} className={`tab-btn ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'cashflow' && <CashFlowTab />}
      {tab === 'fiscal' && <FiscalTab />}
      {tab === 'expenses' && <VehicleExpensesTab />}
    </div>
  );
}
