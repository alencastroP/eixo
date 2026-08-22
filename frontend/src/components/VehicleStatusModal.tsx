import { useEffect } from 'react';
import {
  VEHICLE_STATUS_GROUPS,
  VEHICLE_STATUS_HINTS,
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUS_ORDER,
  type VehicleStatus,
} from '../types';
import { XIcon } from './icons';

interface Props {
  byStatus: Record<VehicleStatus, number>;
  total: number;
  /** Status filtrado agora ('' = sem filtro). */
  active: VehicleStatus | '';
  onSelect: (status: VehicleStatus | '') => void;
  onClose: () => void;
}

const share = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

/**
 * Painel de status do estoque. Os chips do cabeçalho respondem "quantos"; aqui
 * cabe o resto: o que cada status significa, quanto pesa no estoque e a que
 * etapa pertence. Cada linha é o mesmo filtro do chip - clicar aplica e fecha.
 */
export function VehicleStatusModal({ byStatus, total, active, onSelect, onClose }: Props) {
  // Esc fecha o modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const choose = (s: VehicleStatus | '') => {
    onSelect(s);
    onClose();
  };

  const filled = VEHICLE_STATUS_ORDER.filter((s) => (byStatus[s] ?? 0) > 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-lg stk-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Status do estoque"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Status do estoque</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <XIcon size={15} />
          </button>
        </div>

        <div className="modal-body stk-body">
          {/* o estoque inteiro em uma linha: a proporção antes dos números */}
          {filled.length > 0 && (
            <div className="stk-bar" aria-hidden="true">
              {filled.map((s) => (
                <span
                  key={s}
                  className={`stk-bar-seg st-${s}`}
                  style={{ flexGrow: byStatus[s] }}
                  title={`${VEHICLE_STATUS_LABELS[s]}: ${byStatus[s]}`}
                />
              ))}
            </div>
          )}

          <button className={`stk-all ${active === '' ? 'active' : ''}`} onClick={() => choose('')}>
            <span className="stk-all-text">
              <strong>Todo o estoque</strong>
              <span className="stk-row-hint">Mostra os veículos de todos os status.</span>
            </span>
            <span className="stk-all-count ds-num">{total}</span>
          </button>

          {VEHICLE_STATUS_GROUPS.map((g) => {
            const groupTotal = g.statuses.reduce((acc, s) => acc + (byStatus[s] ?? 0), 0);
            return (
              <section key={g.id} className="stk-group">
                <header className="stk-group-head">
                  <span className="ds-label">{g.label}</span>
                  <span className="stk-group-hint">{g.hint}</span>
                  <span className="stk-group-count ds-num">{groupTotal}</span>
                </header>

                <div className="stk-rows">
                  {g.statuses.map((s) => {
                    const n = byStatus[s] ?? 0;
                    return (
                      <button
                        key={s}
                        className={`stk-row st-${s} ${active === s ? 'active' : ''}`}
                        onClick={() => choose(s)}
                        aria-pressed={active === s}
                      >
                        <span className="st-dot" />
                        <span className="stk-row-text">
                          <span className="stk-row-label">{VEHICLE_STATUS_LABELS[s]}</span>
                          <span className="stk-row-hint">{VEHICLE_STATUS_HINTS[s]}</span>
                        </span>
                        <span className="stk-row-num">
                          <strong className="ds-num">{n}</strong>
                          <span className="stk-row-share ds-num">{share(n, total)}%</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
