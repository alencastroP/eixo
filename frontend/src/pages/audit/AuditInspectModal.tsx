import { useState } from 'react';
import { ArrowDownIcon, CodeIcon, ListChecksIcon } from '../../components/icons';
import { avatarColor, initials } from '../../utils/format';
import {
  changedFields,
  formatTimestamp,
  formatValue,
  jsonKeys,
  operationLabel,
  type AuditEntry,
  type JsonValue,
  type Record,
} from './auditEngine';

interface Props {
  entry: AuditEntry;
  onClose: () => void;
}

type Tab = 'human' | 'json';

/** Bloco de código de um lado do diff (Antes ou Depois). */
function JsonBlock({
  record,
  keys,
  changed,
  mode,
  op,
  emptyText,
}: {
  record: Record | null;
  keys: string[];
  changed: Set<string>;
  mode: 'before' | 'after';
  op: AuditEntry['operation'];
  emptyText: string;
}) {
  if (!record) {
    return (
      <div className="json-block">
        <div className="json-empty">{emptyText}</div>
      </div>
    );
  }
  const lineClass = (field: string) => {
    if (!changed.has(field)) return '';
    if (mode === 'before') return op === 'DELETE' ? 'json-removed' : 'json-changed';
    return op === 'CREATE' ? 'json-added' : 'json-changed';
  };
  let ln = 1;
  const line = (content: JSX.Element | string, cls = '') => (
    <div className={`json-line ${cls}`} key={ln}>
      <span className="json-gutter">{ln++}</span>
      <span className="json-code">{content}</span>
    </div>
  );

  return (
    <div className="json-block">
      {line('{')}
      {keys.map((field) => {
        const value = record[field];
        const valueStr = value === undefined ? 'null' : JSON.stringify(value);
        return line(
          <>
            <span className="json-key">"{field}"</span>
            <span className="json-punc">: </span>
            <span className="json-val">{valueStr}</span>
            <span className="json-punc">,</span>
          </>,
          lineClass(field),
        );
      })}
      {line('}')}
    </div>
  );
}

export function AuditInspectModal({ entry, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('human');
  const changed = changedFields(entry);
  const keys = jsonKeys(entry);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-xl audit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header audit-modal-header">
          <div className="audit-modal-id">
            <span className={`audit-op audit-op-${entry.operation}`}>{operationLabel(entry.operation)}</span>
            <div className="audit-modal-title">
              <h2>{entry.entityLabel}</h2>
              <span className="audit-modal-meta">
                <span
                  className="audit-avatar sm"
                  style={{ background: avatarColor(entry.user.name) }}
                  title={entry.user.name}
                >
                  {initials(entry.user.name)}
                </span>
                {entry.user.name} · {entry.moduleLabel} · {formatTimestamp(entry.at)}
              </span>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>

        {/* Abas */}
        <div className="audit-tabs">
          <button className={`audit-tab ${tab === 'human' ? 'active' : ''}`} onClick={() => setTab('human')}>
            <ListChecksIcon size={15} /> O que mudou
          </button>
          <button className={`audit-tab ${tab === 'json' ? 'active' : ''}`} onClick={() => setTab('json')}>
            <CodeIcon size={15} /> JSON (Antes vs. Depois)
          </button>
        </div>

        <div className="modal-body audit-modal-body">
          {tab === 'human' ? (
            <div className="audit-changes">
              {entry.changes.map((c) => (
                <div className="audit-change" key={c.field}>
                  <span className="audit-change-field">{c.label}</span>
                  <div className="audit-change-diff">
                    {c.before !== undefined && (
                      <span className="audit-val before">{formatValue(c.before, c.format)}</span>
                    )}
                    {c.before !== undefined && c.after !== undefined && (
                      <ArrowDownIcon size={14} className="audit-change-arrow" />
                    )}
                    {c.after !== undefined && <span className="audit-val after">{formatValue(c.after, c.format)}</span>}
                  </div>
                </div>
              ))}
              {entry.changes.length === 0 && <p className="muted small">Nenhum campo alterado.</p>}
            </div>
          ) : (
            <div className="audit-json">
              <div className="audit-json-legend">
                <span className="json-legend-item changed">Alterado</span>
                <span className="json-legend-item added">Adicionado</span>
                <span className="json-legend-item removed">Removido</span>
              </div>
              <div className="audit-json-cols">
                <div className="audit-json-col">
                  <div className="audit-json-col-head before">Antes</div>
                  <JsonBlock
                    record={entry.before}
                    keys={keys}
                    changed={changed}
                    mode="before"
                    op={entry.operation}
                    emptyText="Registro não existia antes desta operação."
                  />
                </div>
                <div className="audit-json-col">
                  <div className="audit-json-col-head after">Depois</div>
                  <JsonBlock
                    record={entry.after}
                    keys={keys}
                    changed={changed}
                    mode="after"
                    op={entry.operation}
                    emptyText="Registro removido nesta operação."
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
