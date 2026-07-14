import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ticketsApi, usersApi, type TicketListParams } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { PriorityBadge, StatusDot } from '../components/badges';
import { ConversationPane } from '../components/ConversationPane';
import { InboxIcon, PlusIcon, SearchIcon } from '../components/icons';
import { NewTicketModal } from '../components/NewTicketModal';
import {
  STATUS_LABELS,
  STATUS_ORDER,
  platformLabel,
  type Interaction,
  type Ticket,
  type TicketDetail,
  type TicketStats,
  type TicketStatus,
  type UserListItem,
} from '../types';
import { avatarColor, initials, timeAgo } from '../utils/format';

const PLATFORMS = ['olx', 'mercadolivre', 'webmotors', 'manual'];
const PAGE_SIZE = 30;

type ViewKey = 'all' | 'me' | 'unassigned';

function previewOf(t: Ticket): string {
  if (t.lastMessage) {
    return t.lastMessage.type === 'INTERNAL_NOTE' ? `📌 ${t.lastMessage.body}` : t.lastMessage.body;
  }
  return t.vehicle?.title ?? 'Sem mensagens ainda';
}

/** Converte o detalhe retornado por uma mutação em item de lista (preserva o preview). */
function toListTicket(detail: TicketDetail): Ticket {
  const { interactions, ...rest } = detail;
  const withBody = interactions.filter(
    (i: Interaction) =>
      i.body && (i.type === 'CUSTOMER_MESSAGE' || i.type === 'AGENT_REPLY' || i.type === 'INTERNAL_NOTE'),
  );
  const last = withBody[withBody.length - 1];
  return {
    ...rest,
    lastMessage: last ? { body: (last.body ?? '').slice(0, 140), type: last.type, createdAt: last.createdAt } : null,
  };
}

export function InboxPage() {
  const { id: selectedId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [view, setView] = useState<ViewKey>('all');
  // filtros iniciais podem vir da URL (drill-down do dashboard: ?status= / ?platform=)
  const [filters, setFilters] = useState({
    status: searchParams.get('status') ?? '',
    platform: searchParams.get('platform') ?? '',
    agentId: '',
    dateFrom: '',
    dateTo: '',
  });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (isAdmin) {
      usersApi
        .list()
        .then(setUsers)
        .catch(() => setUsers([]));
    }
  }, [isAdmin]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const assignedTo = filters.agentId || (view === 'me' ? 'me' : view === 'unassigned' ? 'unassigned' : undefined);
    const params: TicketListParams = {
      status: (filters.status || undefined) as TicketStatus | undefined,
      platform: filters.platform || undefined,
      assignedTo,
      search: search || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      page,
      pageSize: PAGE_SIZE,
    };
    Promise.all([ticketsApi.list(params), ticketsApi.stats()])
      .then(([list, s]) => {
        if (cancelled) return;
        setItems((prev) => (page === 1 ? list.items : [...prev, ...list.items]));
        setTotal(list.total);
        setStats(s);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao carregar');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, search, view, page]);

  const setFilter = (key: keyof typeof filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const changeView = (v: ViewKey) => {
    setView(v);
    setFilters((f) => ({ ...f, agentId: '' }));
    setPage(1);
  };

  /** Mutações na conversa refletem na lista sem refetch completo. */
  const handleTicketUpdated = (detail: TicketDetail) => {
    const listTicket = toListTicket(detail);
    setItems((prev) => {
      const next = prev.some((t) => t.id === listTicket.id)
        ? prev.map((t) => (t.id === listTicket.id ? listTicket : t))
        : [listTicket, ...prev];
      return [...next].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    });
    ticketsApi
      .stats()
      .then(setStats)
      .catch(() => {});
  };

  const hasMore = items.length < total;
  const newCount = stats?.byStatus.NEW ?? 0;

  const views = useMemo(
    () =>
      [
        { key: 'all' as ViewKey, label: 'Todos', count: stats?.total },
        { key: 'me' as ViewKey, label: 'Meus', count: undefined },
        { key: 'unassigned' as ViewKey, label: 'Não atribuídos', count: stats?.unassigned },
      ] satisfies Array<{ key: ViewKey; label: string; count: number | undefined }>,
    [stats],
  );

  return (
    <div className={`inbox ${selectedId ? 'has-selection' : ''}`}>
      <section className="inbox-list">
        <header className="inbox-list-header">
          <div className="inbox-title-row">
            <h1>Caixa de entrada</h1>
            {newCount > 0 && <span className="new-count">{newCount} novos</span>}
            <button className="icon-btn" title="Novo ticket manual" onClick={() => setModalOpen(true)}>
              <PlusIcon size={18} />
            </button>
          </div>

          <div className="views-row">
            {views.map((v) => (
              <button
                key={v.key}
                className={`view-chip ${view === v.key && !filters.agentId ? 'active' : ''}`}
                onClick={() => changeView(v.key)}
              >
                {v.label}
                {v.count !== undefined && <span className="view-count">{v.count}</span>}
              </button>
            ))}
          </div>

          <div className="inbox-search">
            <SearchIcon size={15} />
            <input
              placeholder="Buscar nome, telefone, e-mail, nº…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <div className="inbox-filters">
            <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">Status</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <select value={filters.platform} onChange={(e) => setFilter('platform', e.target.value)}>
              <option value="">Origem</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {platformLabel(p)}
                </option>
              ))}
            </select>
            {isAdmin && (
              <select value={filters.agentId} onChange={(e) => setFilter('agentId', e.target.value)}>
                <option value="">Atendente</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}
            <div className="filter-period">
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilter('dateFrom', e.target.value)}
                title="Criados a partir de"
              />
              <span className="filter-period-sep">–</span>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilter('dateTo', e.target.value)}
                title="Criados até"
              />
            </div>
          </div>
        </header>

        <div className="conv-list">
          {error && <div className="alert alert-error">{error}</div>}
          {items.map((t) => {
            const unread = t.status === 'NEW';
            return (
              <button
                key={t.id}
                className={`conv-item ${selectedId === t.id ? 'selected' : ''} ${unread ? 'unread' : ''}`}
                onClick={() => navigate(`/tickets/${t.id}`)}
              >
                <span className="conv-avatar avatar" style={{ backgroundColor: avatarColor(t.lead.name) }}>
                  {initials(t.lead.name)}
                </span>
                <span className="conv-main">
                  <span className="conv-top">
                    <span className="conv-name">{t.lead.name}</span>
                    <span className="conv-time">{timeAgo(t.updatedAt)}</span>
                  </span>
                  <span className="conv-preview">{previewOf(t)}</span>
                  <span className="conv-meta">
                    <StatusDot status={t.status} />
                    <span className="conv-platform">{platformLabel(t.platform)}</span>
                    <span className="conv-number">#{t.number}</span>
                    <PriorityBadge priority={t.priority} />
                    {t.sla.pending && t.sla.breached && (
                      <span className="sla sla-bad" title="SLA de 1ª resposta estourado">
                        ⏱
                      </span>
                    )}
                    {t.assignedTo && (
                      <span
                        className="avatar xs"
                        style={{ backgroundColor: avatarColor(t.assignedTo.name) }}
                        title={t.assignedTo.name}
                      >
                        {initials(t.assignedTo.name)}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}

          {!loading && items.length === 0 && (
            <div className="conv-empty">
              <InboxIcon size={28} />
              <p>Nenhum ticket com os filtros atuais.</p>
            </div>
          )}
          {loading && items.length === 0 && <div className="conv-empty">Carregando…</div>}
          {hasMore && (
            <button className="btn btn-ghost load-more" disabled={loading} onClick={() => setPage((p) => p + 1)}>
              {loading ? 'Carregando…' : `Carregar mais (${items.length} de ${total})`}
            </button>
          )}
        </div>
      </section>

      {selectedId ? (
        <ConversationPane key={selectedId} ticketId={selectedId} onTicketUpdated={handleTicketUpdated} />
      ) : (
        <div className="conv-placeholder">
          <InboxIcon size={40} />
          <h2>Selecione uma conversa</h2>
          <p>Escolha um ticket na lista ao lado para ver o histórico e responder.</p>
        </div>
      )}

      <NewTicketModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
