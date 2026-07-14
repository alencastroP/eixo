import { useEffect, useState, type FormEvent } from 'react';
import { vehiclesApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import type { VehicleDetail } from '../types';
import { formatBRL, formatDateTime } from '../utils/format';
import { TrashIcon } from './icons';

const CATEGORIES = ['Oficina', 'Estética', 'Documentação', 'Peças', 'Outros'];

interface Props {
  vehicleId: string;
  title: string;
  canEdit: boolean;
  onClose: () => void;
  onChanged?: (detail: VehicleDetail) => void;
}

/** Histórico de gastos do veículo — listagem + inclusão (afeta a margem). */
export function VehicleCostsModal({ vehicleId, title, canEdit, onClose, onChanged }: Props) {
  const [detail, setDetail] = useState<VehicleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ category: 'Oficina', description: '', amount: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    vehiclesApi
      .get(vehicleId)
      .then(setDetail)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Falha ao carregar'))
      .finally(() => setLoading(false));
  }, [vehicleId]);

  const apply = (d: VehicleDetail) => {
    setDetail(d);
    onChanged?.(d);
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!form.description.trim() || !Number.isFinite(amount) || amount <= 0) return;
    setSaving(true);
    setError(null);
    try {
      apply(await vehiclesApi.addCost(vehicleId, { category: form.category, description: form.description, amount }));
      setForm({ category: form.category, description: '', amount: '' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao adicionar');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (costId: string) => {
    try {
      apply(await vehiclesApi.deleteCost(vehicleId, costId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao remover');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Histórico de Gastos · {title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {loading && <div className="muted small">Carregando…</div>}
          {error && <div className="alert alert-error">{error}</div>}

          {detail && (
            <>
              <div className="cost-summary">
                <div>
                  <span className="muted small">Total em gastos</span>
                  <strong className="cost-total">{formatBRL(detail.totalCosts) ?? 'R$ 0,00'}</strong>
                </div>
                <div>
                  <span className="muted small">Custo de compra</span>
                  <strong>{formatBRL(detail.costPrice) ?? '—'}</strong>
                </div>
                <div>
                  <span className="muted small">Margem estimada</span>
                  <strong className={detail.margin != null && detail.margin < 0 ? 'danger' : 'success'}>
                    {formatBRL(detail.margin) ?? '—'}
                  </strong>
                </div>
              </div>

              {detail.costs.length === 0 ? (
                <p className="muted small">Nenhum gasto lançado ainda.</p>
              ) : (
                <div className="cost-list">
                  {detail.costs.map((c) => (
                    <div key={c.id} className="cost-row">
                      <span className="cost-cat">{c.category}</span>
                      <span className="cost-desc">{c.description}</span>
                      <span className="cost-date muted small">{formatDateTime(c.incurredAt)}</span>
                      <span className="cost-amount">{formatBRL(c.amount)}</span>
                      {canEdit && (
                        <button className="icon-btn sm" onClick={() => remove(c.id)} title="Remover">
                          <TrashIcon size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {canEdit && (
                <form className="cost-form" onSubmit={add}>
                  <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Descrição do gasto"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    required
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Valor (R$)"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    required
                  />
                  <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                    {saving ? '…' : 'Lançar'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
