import { useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { HistoryIcon, SearchDataIcon, SearchIcon } from '../components/icons';
import { avatarColor, initials } from '../utils/format';
import { AuditInspectModal } from './audit/AuditInspectModal';
import {
  AUDIT_LOG,
  DEFAULT_FILTERS,
  filterLog,
  formatTimestamp,
  MODULES,
  OPERATIONS,
  operationLabel,
  type AuditEntry,
  type AuditFilters,
  type Operation,
  type Period,
} from './audit/auditEngine';

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: '1', label: 'Hoje' },
  { key: '7', label: '7 dias' },
  { key: '30', label: '30 dias' },
];

export function AuditPage() {
  const [filters, setFilters] = useState<AuditFilters>(DEFAULT_FILTERS);
  const [inspecting, setInspecting] = useState<AuditEntry | null>(null);

  const rows = useMemo(() => filterLog(AUDIT_LOG, filters), [filters]);
  const patch = (p: Partial<AuditFilters>) => setFilters((f) => ({ ...f, ...p }));

  return (
    <div className="dash audit-page">
      <PageHeader
        icon={<HistoryIcon size={19} />}
        eyebrow="Segurança & Conformidade"
        title="Trilha de Auditoria"
        subtitle="Histórico completo de criações, edições e exclusões dos últimos 30 dias."
        actions={<span className="audit-count">{rows.length} registros</span>}
      />

      {/* Filtros rápidos */}
      <div className="audit-filters">
        <div className="audit-search">
          <SearchIcon size={15} />
          <input
            value={filters.user}
            onChange={(e) => patch({ user: e.target.value })}
            placeholder="Buscar por usuário…"
          />
        </div>
        <select value={filters.moduleKey} onChange={(e) => patch({ moduleKey: e.target.value })}>
          <option value="">Todos os módulos</option>
          {MODULES.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        <select value={filters.operation} onChange={(e) => patch({ operation: e.target.value as '' | Operation })}>
          <option value="">Todas as ações</option>
          {OPERATIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="segmented audit-period">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              className={filters.period === p.key ? 'active' : ''}
              onClick={() => patch({ period: p.key })}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela de logs */}
      <div className="card table-wrap">
        <table className="fin-table audit-table">
          <thead>
            <tr>
              <th>Horário</th>
              <th>Usuário</th>
              <th>Módulo / Entidade</th>
              <th>Operação</th>
              <th>Resumo da alteração</th>
              <th className="right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="audit-time mono">{formatTimestamp(e.at)}</td>
                <td>
                  <div className="audit-user">
                    <span className="audit-avatar" style={{ background: avatarColor(e.user.name) }}>
                      {initials(e.user.name)}
                    </span>
                    <div className="audit-user-info">
                      <span className="audit-user-name">{e.user.name}</span>
                      <span className="audit-user-role muted small">{e.user.role}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="audit-module">{e.moduleLabel}</span>
                  <span className="audit-entity">{e.entityLabel}</span>
                </td>
                <td>
                  <span className={`audit-op audit-op-${e.operation}`}>{operationLabel(e.operation)}</span>
                </td>
                <td className="audit-summary">{e.summary}</td>
                <td className="right">
                  <button className="audit-inspect" onClick={() => setInspecting(e)}>
                    <SearchDataIcon size={14} /> Inspecionar
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-row">
                  Nenhum registro para os filtros selecionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {inspecting && <AuditInspectModal entry={inspecting} onClose={() => setInspecting(null)} />}
    </div>
  );
}
