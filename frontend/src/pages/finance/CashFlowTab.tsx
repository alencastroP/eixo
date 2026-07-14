import { useCallback, useEffect, useState } from 'react';
import { financeApi, type FinanceListParams } from '../../api/endpoints';
import { FinancialStatusBadge } from '../../components/badges';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
  WalletIcon,
} from '../../components/icons';
import {
  FINANCIAL_CATEGORIES,
  FINANCIAL_STATUS_LABELS,
  type FinanceSummary,
  type FinancialEntry,
  type FinancialStatus,
} from '../../types';
import { formatBRL, formatDate } from '../../utils/format';
import { NewEntryModal } from './NewEntryModal';

const STATUSES: FinancialStatus[] = ['PENDING', 'PAID', 'OVERDUE'];

export function CashFlowTab() {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [filters, setFilters] = useState({ type: '', status: '', category: '' });
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const loadSummary = useCallback(() => {
    financeApi.summary().then(setSummary).catch(() => setSummary(null));
  }, []);

  const loadEntries = useCallback(() => {
    setLoading(true);
    const params: FinanceListParams = {
      type: (filters.type || undefined) as FinanceListParams['type'],
      status: filters.status || undefined,
      category: filters.category || undefined,
    };
    financeApi
      .entries(params)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);
  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const togglePaid = async (entry: FinancialEntry) => {
    const paid = entry.status !== 'PAID';
    const updated = await financeApi.setPaid(entry.id, paid);
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? updated : e)));
    loadSummary();
  };

  const remove = async (id: string) => {
    if (!window.confirm('Excluir este lançamento?')) return;
    await financeApi.remove(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    loadSummary();
  };

  const onCreated = (entry: FinancialEntry) => {
    setEntries((prev) => [entry, ...prev]);
    loadSummary();
  };

  return (
    <div className="cashflow">
      {/* KPIs */}
      <div className="fin-kpi-grid">
        <div className="fin-kpi kpi-balance">
          <div className="fin-kpi-head">
            <span className="fin-kpi-label">Saldo em Caixa</span>
            <span className="fin-kpi-icon">
              <WalletIcon size={16} />
            </span>
          </div>
          <span className={`fin-kpi-value ${summary && summary.balance >= 0 ? 'pos' : 'neg'}`}>
            {summary ? formatBRL(summary.balance) : '—'}
          </span>
          <span className="fin-kpi-sub">entradas − saídas efetivadas</span>
        </div>
        <div className="fin-kpi kpi-in">
          <div className="fin-kpi-head">
            <span className="fin-kpi-label">A Receber no Mês</span>
            <span className="fin-kpi-icon">
              <ArrowDownIcon size={16} />
            </span>
          </div>
          <span className="fin-kpi-value info">{summary ? formatBRL(summary.receivableMonth) : '—'}</span>
          <span className="fin-kpi-sub">faturamento previsto</span>
        </div>
        <div className="fin-kpi kpi-out">
          <div className="fin-kpi-head">
            <span className="fin-kpi-label">A Pagar no Mês</span>
            <span className="fin-kpi-icon">
              <ArrowUpIcon size={16} />
            </span>
          </div>
          <span className="fin-kpi-value warn">{summary ? formatBRL(summary.payableMonth) : '—'}</span>
          <span className="fin-kpi-sub">
            {summary && summary.overdueCount > 0 ? (
              <span className="danger">{summary.overdueCount} em atraso</span>
            ) : (
              'despesas previstas'
            )}
          </span>
        </div>
      </div>

      {/* toolbar */}
      <div className="fin-toolbar">
        <div className="fin-filters">
          <select value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}>
            <option value="">Tipo</option>
            <option value="RECEIVABLE">A Receber</option>
            <option value="PAYABLE">A Pagar</option>
          </select>
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">Status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {FINANCIAL_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}>
            <option value="">Categoria</option>
            {FINANCIAL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}>
          <PlusIcon size={16} /> Lançar Conta
        </button>
      </div>

      {/* tabela */}
      <div className="card table-wrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Categoria</th>
              <th>Veículo</th>
              <th>Vencimento</th>
              <th className="right">Valor</th>
              <th>Status</th>
              <th className="right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className={e.status === 'OVERDUE' ? 'row-overdue' : ''}>
                <td>
                  <span className={`fin-flow-dot ${e.type === 'RECEIVABLE' ? 'in' : 'out'}`} />
                  {e.description}
                </td>
                <td className="muted">{e.category}</td>
                <td className="muted">{e.vehicle ? `${e.vehicle.brand} ${e.vehicle.model}` : '—'}</td>
                <td>{formatDate(e.dueDate)}</td>
                <td className={`right amount ${e.type === 'RECEIVABLE' ? 'in' : 'out'}`}>
                  {e.type === 'RECEIVABLE' ? '+' : '−'} {formatBRL(e.amount)}
                </td>
                <td>
                  <FinancialStatusBadge status={e.status} />
                </td>
                <td className="right">
                  <div className="row-actions">
                    <button
                      className={`icon-btn sm ${e.status === 'PAID' ? 'active' : ''}`}
                      title={e.status === 'PAID' ? 'Reabrir' : 'Marcar como pago'}
                      onClick={() => togglePaid(e)}
                    >
                      <CheckIcon size={14} />
                    </button>
                    <button className="icon-btn sm" title="Excluir" onClick={() => remove(e.id)}>
                      <TrashIcon size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-row">
                  Nenhum lançamento com esses filtros.
                </td>
              </tr>
            )}
            {loading && entries.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-row">
                  Carregando…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && <NewEntryModal onClose={() => setModalOpen(false)} onCreated={onCreated} />}
    </div>
  );
}
