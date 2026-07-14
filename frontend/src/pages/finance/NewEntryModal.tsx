import { useEffect, useState, type FormEvent } from 'react';
import { financeApi, vehiclesApi } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import { FINANCIAL_CATEGORIES, type FinancialEntry, type FinancialType, type VehicleCard } from '../../types';

interface Props {
  onClose: () => void;
  onCreated: (entry: FinancialEntry) => void;
}

export function NewEntryModal({ onClose, onCreated }: Props) {
  const [type, setType] = useState<FinancialType>('PAYABLE');
  const [category, setCategory] = useState(FINANCIAL_CATEGORIES[2]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [vehicleId, setVehicleId] = useState('');
  const [paid, setPaid] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleCard[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    vehiclesApi
      .list({ pageSize: 60 })
      .then((r) => setVehicles(r.items))
      .catch(() => setVehicles([]));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!description.trim() || !Number.isFinite(value) || value <= 0) {
      setError('Preencha descrição e um valor válido.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const entry = await financeApi.create({
        type,
        category,
        description,
        amount: value,
        dueDate,
        vehicleId: vehicleId || null,
        paid,
      });
      onCreated(entry);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao lançar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Lançar Conta</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <form className="modal-body" onSubmit={submit}>
          <div className="type-toggle">
            <button
              type="button"
              className={`type-toggle-btn ${type === 'RECEIVABLE' ? 'active receivable' : ''}`}
              onClick={() => setType('RECEIVABLE')}
            >
              A Receber
            </button>
            <button
              type="button"
              className={`type-toggle-btn ${type === 'PAYABLE' ? 'active payable' : ''}`}
              onClick={() => setType('PAYABLE')}
            >
              A Pagar
            </button>
          </div>

          <label className="field">
            <span>Descrição *</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} required autoFocus />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Categoria</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {FINANCIAL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Valor (R$) *</span>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>Vencimento *</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
            </label>
            <label className="field">
              <span>Veículo vinculado</span>
              <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                <option value="">Nenhum</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.brand} {v.model} {v.version ?? ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="checkbox-field">
            <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
            <span>Já {type === 'RECEIVABLE' ? 'recebido' : 'pago'}</span>
          </label>

          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Lançando…' : 'Lançar Conta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
