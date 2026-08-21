import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ticketsApi, type TicketListParams } from '../api/endpoints';
import { PriorityBadge } from '../components/badges';
import { RefreshIcon } from '../components/icons';
import { TicketScopeFilter, type TicketScope } from '../components/TicketScopeFilter';
import { TicketsViewSwitcher } from '../components/TicketsViewSwitcher';
import { STATUS_LABELS, STATUS_ORDER, platformLabel, type Ticket, type TicketStats, type TicketStatus } from '../types';
import { avatarColor, initials, timeAgo } from '../utils/format';

const PAGE_SIZE = 100;

/** Submódulo do Atendimento - mesmo escopo (Todos/Meus/Não atribuídos) da Caixa de entrada. */
export function KanbanPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = (searchParams.get('scope') as TicketScope | null) ?? 'all';

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<TicketStatus | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const assignedTo = view === 'all' ? undefined : view;
    const params: TicketListParams = { page: 1, pageSize: PAGE_SIZE, assignedTo };
    Promise.all([ticketsApi.list(params), ticketsApi.stats()])
      .then(([list, s]) => {
        setTickets(list.items);
        setTotal(list.total);
        setStats(s);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Falha ao carregar o painel'))
      .finally(() => setLoading(false));
  }, [view]);

  useEffect(() => {
    load();
  }, [load]);

  const changeView = (v: TicketScope) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v === 'all') next.delete('scope');
      else next.set('scope', v);
      return next;
    });
  };

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(STATUS_ORDER.map((s) => [s, [] as Ticket[]])) as Record<TicketStatus, Ticket[]>;
    for (const t of tickets) map[t.status]?.push(t);
    return map;
  }, [tickets]);

  const moveTicket = async (ticketId: string, to: TicketStatus) => {
    const current = tickets.find((t) => t.id === ticketId);
    if (!current || current.status === to) return;
    const snapshot = tickets;
    setTickets((ts) => ts.map((t) => (t.id === ticketId ? { ...t, status: to } : t))); // otimista
    try {
      await ticketsApi.update(ticketId, { status: to });
    } catch (err) {
      setTickets(snapshot); // reverte
      window.alert(err instanceof Error ? err.message : 'Não foi possível mover o ticket');
    }
  };

  const scopeQuery = view !== 'all' ? `scope=${view}` : undefined;

  return (
    <div className="kanban-page">
      <header className="kanban-header">
        <div className="inbox-title-row">
          <TicketsViewSwitcher active="kanban" scopeQuery={scopeQuery} />
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            <RefreshIcon size={15} />
            {loading ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>
        <TicketScopeFilter
          value={view}
          onChange={changeView}
          totalCount={stats?.total}
          unassignedCount={stats?.unassigned}
        />
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {total > tickets.length && (
        <p className="muted small">Exibindo os {tickets.length} tickets com atividade mais recente (de {total}).</p>
      )}

      <div className="board">
        {STATUS_ORDER.map((status) => (
          <div
            key={status}
            className={`board-col ${dragOver === status ? 'drag-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(status);
            }}
            onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const id = e.dataTransfer.getData('text/plain');
              if (id) void moveTicket(id, status);
            }}
          >
            <div className="board-col-header">
              <span className={`dot status-dot-${status}`} />
              <span className="board-col-title">{STATUS_LABELS[status]}</span>
              <span className="board-col-count">{byStatus[status].length}</span>
            </div>
            <div className="board-col-body">
              {byStatus[status].map((t) => (
                <div
                  key={t.id}
                  className="kanban-card"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
                  onClick={() => navigate(`/tickets/${t.id}`)}
                >
                  <div className="kanban-card-top">
                    <span className="avatar xs" style={{ backgroundColor: avatarColor(t.lead.name) }}>
                      {initials(t.lead.name)}
                    </span>
                    <span className="kanban-card-name">{t.lead.name}</span>
                    <PriorityBadge priority={t.priority} />
                    {t.sla.pending && t.sla.breached && (
                      <span className="sla sla-bad" title="SLA de primeira resposta estourado">
                        ⏱
                      </span>
                    )}
                  </div>
                  {t.vehicle?.title && <div className="kanban-card-vehicle">{t.vehicle.title}</div>}
                  <div className="kanban-card-foot">
                    <span className="conv-platform">{platformLabel(t.platform)}</span>
                    <span className="conv-number">#{t.number}</span>
                    <span className="muted small">{timeAgo(t.lastCustomerMessageAt ?? t.createdAt)}</span>
                    {t.assignedTo && (
                      <span
                        className="avatar xs foot-avatar"
                        style={{ backgroundColor: avatarColor(t.assignedTo.name) }}
                        title={t.assignedTo.name}
                      >
                        {initials(t.assignedTo.name)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {byStatus[status].length === 0 && <div className="board-empty">Sem tickets</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
