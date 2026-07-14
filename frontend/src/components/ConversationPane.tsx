import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { ticketsApi, usersApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  platformLabel,
  type Interaction,
  type TicketDetail,
  type TicketPriority,
  type TicketStatus,
  type UserListItem,
} from '../types';
import { avatarColor, formatBRL, formatDateTime, formatDuration, formatPhone, initials } from '../utils/format';
import { ChevronLeftIcon, InfoIcon, SendIcon, SparklesIcon } from './icons';
import { CoPilotPanel } from './CoPilotPanel';
import { QuickAnalysisBlock } from './QuickAnalysisBlock';

function metaStr(metadata: Record<string, unknown> | null, key: string): string | null {
  const v = metadata?.[key];
  return typeof v === 'string' ? v : null;
}

const statusLabel = (v: string | null) => (v ? (STATUS_LABELS[v as TicketStatus] ?? v) : '—');
const priorityLabel = (v: string | null) => (v ? (PRIORITY_LABELS[v as TicketPriority] ?? v) : '—');

function TimelineItem({ interaction, leadName }: { interaction: Interaction; leadName: string }) {
  const { type, body, metadata, author, createdAt } = interaction;
  const time = formatDateTime(createdAt);

  switch (type) {
    case 'CUSTOMER_MESSAGE':
      return (
        <div className="msg-row in">
          <span className="avatar sm" style={{ backgroundColor: avatarColor(leadName) }}>
            {initials(leadName)}
          </span>
          <div className="msg-col">
            <div className="msg-bubble in">{body}</div>
            <div className="msg-caption">
              {leadName} · {time}
            </div>
          </div>
        </div>
      );
    case 'AGENT_REPLY': {
      const ai = metadata?.ai === true;
      const name = ai ? 'Co-Piloto IA' : (author?.name ?? 'Atendente');
      return (
        <div className="msg-row out">
          <span className={`avatar sm ${ai ? 'avatar-ai' : ''}`} style={ai ? undefined : { backgroundColor: avatarColor(name) }}>
            {ai ? <SparklesIcon size={13} /> : initials(name)}
          </span>
          <div className="msg-col">
            <div className={`msg-bubble out ${ai ? 'ai' : ''}`}>{body}</div>
            <div className="msg-caption">
              {ai && <span className="ai-tag">IA</span>} {name} · {time}
            </div>
          </div>
        </div>
      );
    }
    case 'INTERNAL_NOTE':
      return (
        <div className="note-block">
          <div className="note-header">📌 Nota interna · {author?.name ?? '—'}</div>
          <div className="note-body">{body}</div>
          <div className="msg-caption">{time}</div>
        </div>
      );
    case 'STATUS_CHANGE': {
      const auto = metadata?.auto === true;
      return (
        <div className="sysline">
          <span>
            Status: {statusLabel(metaStr(metadata, 'from'))} → <strong>{statusLabel(metaStr(metadata, 'to'))}</strong>
            {auto ? ' (automático)' : ''} · {author?.name ?? 'sistema'} · {time}
          </span>
        </div>
      );
    }
    case 'ASSIGNMENT': {
      const toName = metaStr(metadata, 'toName');
      const auto = metadata?.auto === true;
      return (
        <div className="sysline">
          <span>
            {toName ? (
              <>
                Atribuído a <strong>{toName}</strong>
                {auto ? ' (assumiu ao responder)' : ''}
              </>
            ) : (
              'Atribuição removida'
            )}{' '}
            · {author?.name ?? 'sistema'} · {time}
          </span>
        </div>
      );
    }
    case 'SYSTEM': {
      if (metadata?.kind === 'priority') {
        return (
          <div className="sysline">
            <span>
              Prioridade: {priorityLabel(metaStr(metadata, 'from'))} →{' '}
              <strong>{priorityLabel(metaStr(metadata, 'to'))}</strong> · {author?.name ?? 'sistema'} · {time}
            </span>
          </div>
        );
      }
      return (
        <div className="sysline">
          <span>
            {body ?? 'Evento de sistema'} · {time}
          </span>
        </div>
      );
    }
    default:
      return null;
  }
}

interface Props {
  ticketId: string;
  onTicketUpdated: (detail: TicketDetail) => void;
}

export function ConversationPane({ ticketId, onTicketUpdated }: Props) {
  const { user } = useAuth();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState('');
  const [composerType, setComposerType] = useState<'AGENT_REPLY' | 'INTERNAL_NOTE'>('AGENT_REPLY');
  const [sending, setSending] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === 'ADMIN';
  const mine = ticket?.assignedTo?.id === user?.id;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTicket(await ticketsApi.get(ticketId));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar a conversa');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (isAdmin) {
      usersApi
        .list()
        .then(setUsers)
        .catch(() => setUsers([]));
    }
  }, [isAdmin]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ticket?.interactions.length, loading]);

  const applyUpdate = (detail: TicketDetail) => {
    setTicket(detail);
    onTicketUpdated(detail);
  };

  const patch = async (changes: Parameters<typeof ticketsApi.update>[1]) => {
    if (!ticket) return;
    setMutating(true);
    try {
      applyUpdate(await ticketsApi.update(ticket.id, changes));
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Não foi possível atualizar');
    } finally {
      setMutating(false);
    }
  };

  const send = async () => {
    const body = composer.trim();
    if (!body || !ticket || sending) return;
    setSending(true);
    try {
      applyUpdate(await ticketsApi.addInteraction(ticket.id, { type: composerType, body }));
      setComposer('');
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Não foi possível enviar');
    } finally {
      setSending(false);
    }
  };

  const onComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void send();
    }
  };

  if (loading && !ticket) return <div className="conversation conv-loading">Carregando conversa…</div>;
  if (error && !ticket) {
    return (
      <div className="conversation conv-loading">
        <div className="alert alert-error">{error}</div>
        <Link to="/tickets" className="btn btn-ghost btn-sm">
          Voltar
        </Link>
      </div>
    );
  }
  if (!ticket) return null;

  const price = formatBRL(typeof ticket.vehicle?.price === 'number' ? ticket.vehicle.price : null);

  return (
    <>
      <section className="conversation">
        <header className="conv-header">
          <Link to="/tickets" className="icon-btn back-btn" title="Voltar">
            <ChevronLeftIcon size={18} />
          </Link>
          <span className="avatar sm" style={{ backgroundColor: avatarColor(ticket.lead.name) }}>
            {initials(ticket.lead.name)}
          </span>
          <div className="conv-header-title">
            <strong>{ticket.lead.name}</strong>
            <span className="conv-header-sub">
              #{ticket.number} · {platformLabel(ticket.platform)}
              {ticket.sla.pending && ticket.sla.breached && (
                <span className="sla sla-bad"> · ⏱ {formatDuration(ticket.sla.firstResponseSeconds)} sem resposta</span>
              )}
            </span>
          </div>

          <div className="conv-header-actions">
            <select
              className="control-sm"
              value={ticket.status}
              disabled={mutating}
              onChange={(e) => void patch({ status: e.target.value as TicketStatus })}
              title="Status"
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>

            <select
              className="control-sm"
              value={ticket.priority}
              disabled={mutating}
              onChange={(e) => void patch({ priority: e.target.value as TicketPriority })}
              title="Prioridade"
            >
              {(Object.keys(PRIORITY_LABELS) as TicketPriority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>

            {isAdmin ? (
              <select
                className="control-sm"
                value={ticket.assignedTo?.id ?? ''}
                disabled={mutating}
                onChange={(e) => void patch({ assignedToId: e.target.value || null })}
                title="Responsável"
              >
                <option value="">Não atribuído</option>
                {users
                  .filter((u) => u.active)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            ) : ticket.assignedTo ? (
              mine ? (
                <button className="btn btn-ghost btn-sm" disabled={mutating} onClick={() => void patch({ assignedToId: null })}>
                  Liberar
                </button>
              ) : (
                <span className="muted small">{ticket.assignedTo.name}</span>
              )
            ) : (
              <button className="btn btn-primary btn-sm" disabled={mutating} onClick={() => void patch({ assignedToId: user!.id })}>
                Assumir
              </button>
            )}

            <button
              className={`icon-btn ${sidebarOpen ? 'active' : ''}`}
              title="Detalhes"
              onClick={() => setSidebarOpen((v) => !v)}
            >
              <InfoIcon size={18} />
            </button>
          </div>
        </header>

        <div className="conv-body" ref={bodyRef}>
          {ticket.interactions.map((i) => (
            <TimelineItem key={i.id} interaction={i} leadName={ticket.lead.name} />
          ))}
        </div>

        <div className="composer-wrap">
          <div className={`composer-card ${composerType === 'INTERNAL_NOTE' ? 'note-mode' : ''}`}>
            <div className="composer-tabs">
              <button
                className={`composer-tab ${composerType === 'AGENT_REPLY' ? 'active' : ''}`}
                onClick={() => setComposerType('AGENT_REPLY')}
              >
                Responder
              </button>
              <button
                className={`composer-tab note-tab ${composerType === 'INTERNAL_NOTE' ? 'active' : ''}`}
                onClick={() => setComposerType('INTERNAL_NOTE')}
              >
                Nota interna
              </button>
            </div>
            <textarea
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder={
                composerType === 'AGENT_REPLY'
                  ? `Responder ${ticket.lead.name}…`
                  : 'Nota visível apenas para a equipe…'
              }
              rows={3}
            />
            <div className="composer-bottom">
              <span className="composer-hint">
                {!ticket.assignedTo && composerType === 'AGENT_REPLY'
                  ? 'Ao responder, o ticket será atribuído a você. · '
                  : ''}
                Ctrl+Enter envia
              </span>
              <button className="btn btn-primary btn-sm" onClick={() => void send()} disabled={sending || !composer.trim()}>
                <SendIcon size={14} />
                {sending ? 'Enviando…' : composerType === 'AGENT_REPLY' ? 'Enviar' : 'Salvar nota'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {sidebarOpen && (
        <aside className="conv-sidebar">
          <CoPilotPanel ticket={ticket} onUpdated={applyUpdate} />
          <QuickAnalysisBlock leadDocument={ticket.lead.document} />

          <details open className="side-sec">
            <summary>Lead</summary>
            {ticket.lead.anonymizedAt && (
              <div className="alert alert-info small">Dados anonimizados a pedido do titular (LGPD).</div>
            )}
            <dl className="side-props">
              <dt>Nome</dt>
              <dd>{ticket.lead.name}</dd>
              <dt>Telefone</dt>
              <dd>
                {ticket.lead.phone ? <a href={`tel:+55${ticket.lead.phone}`}>{formatPhone(ticket.lead.phone)}</a> : '—'}
              </dd>
              <dt>E-mail</dt>
              <dd>{ticket.lead.email ? <a href={`mailto:${ticket.lead.email}`}>{ticket.lead.email}</a> : '—'}</dd>
            </dl>
          </details>

          <details open className="side-sec">
            <summary>Veículo de interesse</summary>
            {ticket.vehicle ? (
              <dl className="side-props">
                <dt>Anúncio</dt>
                <dd>{ticket.vehicle.title ?? '—'}</dd>
                {price && (
                  <>
                    <dt>Preço</dt>
                    <dd>{price}</dd>
                  </>
                )}
                {typeof ticket.vehicle.url === 'string' && (
                  <>
                    <dt>Link</dt>
                    <dd>
                      <a href={ticket.vehicle.url} target="_blank" rel="noreferrer">
                        Ver anúncio ↗
                      </a>
                    </dd>
                  </>
                )}
                {typeof ticket.vehicle.externalId === 'string' && (
                  <>
                    <dt>Ref. externa</dt>
                    <dd className="mono">{ticket.vehicle.externalId}</dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="muted small">Sem veículo vinculado.</p>
            )}
          </details>

          <details open className="side-sec">
            <summary>Detalhes</summary>
            <dl className="side-props">
              <dt>Status</dt>
              <dd>{STATUS_LABELS[ticket.status]}</dd>
              <dt>Prioridade</dt>
              <dd>{PRIORITY_LABELS[ticket.priority]}</dd>
              <dt>Responsável</dt>
              <dd>{ticket.assignedTo?.name ?? 'Não atribuído'}</dd>
              <dt>Origem</dt>
              <dd>{platformLabel(ticket.platform)}</dd>
              {ticket.campaign && (
                <>
                  <dt>Campanha</dt>
                  <dd>{ticket.campaign}</dd>
                </>
              )}
              <dt>Criado em</dt>
              <dd>{formatDateTime(ticket.createdAt)}</dd>
              <dt>1ª resposta</dt>
              <dd>
                {ticket.sla.pending
                  ? `pendente (${formatDuration(ticket.sla.firstResponseSeconds)})`
                  : `em ${formatDuration(ticket.sla.firstResponseSeconds)}`}
              </dd>
              <dt>Última msg.</dt>
              <dd>{formatDateTime(ticket.lastCustomerMessageAt)}</dd>
              {ticket.closedAt && (
                <>
                  <dt>Encerrado</dt>
                  <dd>{formatDateTime(ticket.closedAt)}</dd>
                </>
              )}
            </dl>
          </details>
        </aside>
      )}
    </>
  );
}
