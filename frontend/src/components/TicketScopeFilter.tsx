export type TicketScope = 'all' | 'me' | 'unassigned';

interface ScopeOption {
  key: TicketScope;
  label: string;
  count?: number;
}

interface Props {
  value: TicketScope;
  onChange: (scope: TicketScope) => void;
  totalCount?: number;
  unassignedCount?: number;
}

/**
 * Filtro "Todos / Meus / Não atribuídos", centralizado no módulo de Tickets.
 * Usado tanto pela Caixa de entrada quanto pelo Kanban — mesmo componente,
 * mesmo comportamento, para não haver dois lugares definindo o mesmo escopo.
 */
export function TicketScopeFilter({ value, onChange, totalCount, unassignedCount }: Props) {
  const options: ScopeOption[] = [
    { key: 'all', label: 'Todos', count: totalCount },
    { key: 'me', label: 'Meus' },
    { key: 'unassigned', label: 'Não atribuídos', count: unassignedCount },
  ];

  return (
    <div className="views-row scope-filter">
      {options.map((opt) => (
        <button
          key={opt.key}
          className={`view-chip ${value === opt.key ? 'active' : ''}`}
          onClick={() => onChange(opt.key)}
        >
          {opt.label}
          {opt.count !== undefined && <span className="view-count">{opt.count}</span>}
        </button>
      ))}
    </div>
  );
}
