import { useEffect, useState } from 'react';
import { vehiclesApi } from '../../api/endpoints';
import { CarIcon, CoinsIcon } from '../../components/icons';
import type { VehicleCard, VehicleDetail } from '../../types';
import { formatBRL, formatDate } from '../../utils/format';

/**
 * Auditoria do custo real por veículo: reaproveita os gastos de preparação já
 * lançados no módulo de Estoque e mostra a fórmula
 * Preço de Compra + Total de Despesas = Custo Real Atual.
 */
export function VehicleExpensesTab() {
  const [vehicles, setVehicles] = useState<VehicleCard[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<VehicleDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    vehiclesApi
      .list({ pageSize: 60 })
      .then((r) => {
        setVehicles(r.items);
        if (r.items[0]) setSelectedId(r.items[0].id);
      })
      .catch(() => setVehicles([]));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    vehiclesApi
      .get(selectedId)
      .then(setDetail)
      .finally(() => setLoading(false));
  }, [selectedId]);

  const cost = detail?.costPrice ?? 0;
  const totalExpenses = detail?.totalCosts ?? 0;
  const realCost = cost + totalExpenses;

  return (
    <div className="expenses">
      <div className="expenses-toolbar">
        <label className="field expenses-select">
          <span>Veículo</span>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.brand} {v.model} {v.version ?? ''} · {v.yearModel}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && !detail && <div className="muted">Carregando…</div>}

      {detail && (
        <div className="expenses-layout">
          {/* Fórmula do custo real */}
          <div className="cost-formula">
            <div className="cost-formula-item">
              <span className="cost-formula-label">Preço de Compra</span>
              <span className="cost-formula-value">{formatBRL(cost)}</span>
            </div>
            <span className="cost-formula-op">+</span>
            <div className="cost-formula-item">
              <span className="cost-formula-label">Despesas de Preparação</span>
              <span className="cost-formula-value warn">{formatBRL(totalExpenses)}</span>
            </div>
            <span className="cost-formula-op">=</span>
            <div className="cost-formula-item total">
              <span className="cost-formula-label">Custo Real Atual</span>
              <span className="cost-formula-value accent">{formatBRL(realCost)}</span>
            </div>
          </div>

          {/* Linha do tempo de gastos */}
          <div className="panel">
            <div className="panel-header">
              <h2>Linha do Tempo de Gastos</h2>
              <span className="muted small">{detail.costs.length} lançamentos</span>
            </div>

            {detail.costs.length === 0 ? (
              <div className="expenses-empty">
                <CoinsIcon size={26} />
                <p>Nenhum gasto de preparação lançado para este veículo.</p>
                <span className="muted small">Adicione gastos pela tela do veículo no módulo de Estoque.</span>
              </div>
            ) : (
              <div className="expense-timeline">
                {detail.costs.map((c) => (
                  <div key={c.id} className="expense-item">
                    <span className="expense-dot" />
                    <div className="expense-body">
                      <div className="expense-top">
                        <span className="expense-desc">{c.description}</span>
                        <span className="expense-amount">{formatBRL(c.amount)}</span>
                      </div>
                      <div className="expense-meta muted small">
                        <span className="expense-cat">{c.category}</span> · {formatDate(c.incurredAt)}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="expense-total-row">
                  <CarIcon size={15} />
                  <span>Total investido em preparação</span>
                  <strong>{formatBRL(totalExpenses)}</strong>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
