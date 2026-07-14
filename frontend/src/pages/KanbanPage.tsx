import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ticketsApi } from '../api/endpoints';
import { PriorityBadge } from '../components/badges';
import { ColumnsIcon, RefreshIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { STATUS_LABELS, STATUS_ORDER, platformLabel, type Ticket, type TicketStatus } from '../types';
import { avatarColor, initials, timeAgo } from '../utils/format';

export function KanbanPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<TicketStatus | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    ticketsApi
      .list({ page: 1, pageSize: 100 })
      .then((res) => {
        setTickets(res.items);
        setTotal(res.total);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Falha ao carregar o painel'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  return (
    <div className="kanban-page">
      <PageHeader
        icon={<ColumnsIcon size={19} />}
        eyebrow="Atendimento"
        title="Painel Kanban"
        subtitle="Arraste os cards entre as colunas para mudar o status."
        actions={
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            <RefreshIcon size={15} />
            {loading ? 'Atualizando…' : 'Atualizar'}
          </button>
        }
      />

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
