import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDownIcon, ColumnsIcon, InboxIcon } from './icons';

export type TicketsView = 'inbox' | 'kanban';

interface ViewOption {
  key: TicketsView;
  label: string;
  to: string;
  icon: JSX.Element;
}

const OPTIONS: ViewOption[] = [
  { key: 'inbox', label: 'Caixa de entrada', to: '/tickets', icon: <InboxIcon size={16} /> },
  { key: 'kanban', label: 'Kanban', to: '/kanban', icon: <ColumnsIcon size={16} /> },
];

interface Props {
  active: TicketsView;
  /** Preserva o escopo (Todos/Meus/Não atribuídos) ao trocar de submódulo. */
  scopeQuery?: string;
}

/**
 * Título "Caixa de entrada" que também é o seletor de submódulo do Atendimento.
 * O Kanban não tem entrada própria na navegação - só se chega a ele por aqui,
 * e a Caixa de entrada é sempre o ponto de partida (link do rail aponta só
 * para /tickets).
 */
export function TicketsViewSwitcher({ active, scopeQuery }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const activeOption = OPTIONS.find((o) => o.key === active) ?? OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (opt: ViewOption) => {
    setOpen(false);
    if (opt.key === active) return;
    navigate(scopeQuery ? `${opt.to}?${scopeQuery}` : opt.to);
  };

  return (
    <div className="view-switcher" ref={ref}>
      <button
        type="button"
        className="view-switcher-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <h1>{activeOption.label}</h1>
        <ChevronDownIcon size={18} className={`view-switcher-chevron ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <div className="view-switcher-menu" role="listbox">
          {OPTIONS.map((opt) => (
            <button
              key={opt.key}
              className={`view-switcher-option ${opt.key === active ? 'active' : ''}`}
              onClick={() => go(opt)}
              role="option"
              aria-selected={opt.key === active}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
