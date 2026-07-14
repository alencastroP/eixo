import { PlusIcon, TrashIcon } from '../../components/icons';
import { distinctValues, getField, type FilterCond, type ModuleSchema, type Op } from './reportEngine';

const TEXT_OPS: Array<{ v: Op; label: string }> = [
  { v: 'eq', label: 'é igual a' },
  { v: 'ne', label: 'é diferente de' },
  { v: 'contains', label: 'contém' },
];
const NUM_OPS: Array<{ v: Op; label: string }> = [
  { v: 'eq', label: '=' },
  { v: 'ne', label: '≠' },
  { v: 'gt', label: '>' },
  { v: 'lt', label: '<' },
  { v: 'gte', label: '≥' },
  { v: 'lte', label: '≤' },
];

interface Props {
  module: ModuleSchema;
  filters: FilterCond[];
  onChange: (filters: FilterCond[]) => void;
}

/** Bloco de condições dinâmicas reutilizado no painel lateral e no modal de criação. */
export function FilterBuilder({ module, filters, onChange }: Props) {
  const add = () => {
    const first = module.fields.find((f) => f.role === 'dimension') ?? module.fields[0];
    onChange([
      ...filters,
      {
        id: Math.random().toString(36).slice(2, 9),
        field: first.key,
        op: first.type === 'number' ? 'gte' : 'eq',
        value: '',
      },
    ]);
  };
  const update = (id: string, patch: Partial<FilterCond>) =>
    onChange(filters.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const remove = (id: string) => onChange(filters.filter((f) => f.id !== id));

  return (
    <div className="report-filters">
      {filters.map((f, idx) => {
        const field = getField(module, f.field);
        const isNum = field?.type === 'number';
        const ops = isNum ? NUM_OPS : TEXT_OPS;
        const options = !isNum && field?.role === 'dimension' ? distinctValues(module, f.field) : null;
        return (
          <div key={f.id} className="report-filter">
            {idx > 0 && <span className="report-filter-and">E</span>}
            <div className="report-filter-body">
              <select
                className="report-filter-field"
                value={f.field}
                onChange={(e) => {
                  const nf = getField(module, e.target.value);
                  update(f.id, { field: e.target.value, op: nf?.type === 'number' ? 'gte' : 'eq', value: '' });
                }}
              >
                {module.fields.map((mf) => (
                  <option key={mf.key} value={mf.key}>
                    {mf.label}
                  </option>
                ))}
              </select>
              <div className="report-filter-cond">
                <select value={f.op} onChange={(e) => update(f.id, { op: e.target.value as Op })}>
                  {ops.map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {options ? (
                  <select value={f.value} onChange={(e) => update(f.id, { value: e.target.value })}>
                    <option value="">Selecione…</option>
                    {options.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={isNum ? 'number' : 'text'}
                    value={f.value}
                    placeholder={isNum ? '0' : 'valor'}
                    onChange={(e) => update(f.id, { value: e.target.value })}
                  />
                )}
              </div>
            </div>
            <button className="icon-btn sm report-filter-del" title="Remover" onClick={() => remove(f.id)} type="button">
              <TrashIcon size={13} />
            </button>
          </div>
        );
      })}
      <button className="report-add-filter" onClick={add} type="button">
        <PlusIcon size={14} /> Adicionar condição
      </button>
    </div>
  );
}
