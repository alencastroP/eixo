import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { platformApi } from '../api/endpoints';
import { PageHeader } from '../components/PageHeader';
import { DatabaseIcon, ShieldIcon, XIcon } from '../components/icons';
import type { AccountStatus, PlatformAccountDetail, PlatformAccountOverview, PlatformSupportSession } from '../types';
import { formatBRL, formatDate, formatDateTime } from '../utils/format';

const brl = (cents: number) => formatBRL(cents / 100) ?? 'R$ 0,00';

const STATUS_LABEL: Record<AccountStatus, string> = {
  TRIAL: 'Trial',
  ACTIVE: 'Ativa',
  PAST_DUE: 'Inadimplente',
  SUSPENDED: 'Suspensa',
  EXPIRED: 'Expirada',
  CANCELED: 'Cancelada',
};

interface SessionModalState {
  accountId: string;
  accountName: string;
  reason: string;
  durationMinutes: number;
}

/**
 * Central de todas as contas do Eixo - só existe para a conta-plataforma
 * (ver PLATFORM_ACCOUNT_ID). Módulo à parte da Central de Administração de
 * cada loja, que só enxerga a própria conta.
 */
export function PlatformPage() {
  const [accounts, setAccounts] = useState<PlatformAccountOverview[]>([]);
  const [sessions, setSessions] = useState<PlatformSupportSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<PlatformAccountDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sessionModal, setSessionModal] = useState<SessionModalState | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([platformApi.listAccounts(), platformApi.listActiveSessions()])
      .then(([a, s]) => {
        setAccounts(a);
        setSessions(s);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Falha ao carregar as contas'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openDetail = async (id: string) => {
    setError(null);
    setDetailLoading(true);
    try {
      setDetail(await platformApi.getAccount(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar a conta');
    } finally {
      setDetailLoading(false);
    }
  };

  const startSession = async (e: FormEvent) => {
    e.preventDefault();
    if (!sessionModal) return;
    setStarting(true);
    setError(null);
    try {
      const result = await platformApi.startSupportSession(sessionModal.accountId, {
        reason: sessionModal.reason.trim() || undefined,
        durationMinutes: sessionModal.durationMinutes,
      });
      // Nova aba: o token entra no sessionStorage DELA (ver consumeSupportSessionHash
      // em main.tsx) - a sessão do admin da plataforma nesta aba não é tocada.
      window.open(`/support-session#token=${encodeURIComponent(result.accessToken)}`, '_blank');
      setSessionModal(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao abrir a sessão de suporte');
    } finally {
      setStarting(false);
    }
  };

  const forceEnd = async (sessionId: string) => {
    setError(null);
    try {
      await platformApi.endSupportSession(sessionId);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao encerrar a sessão');
    }
  };

  return (
    <div className="dash platform-page">
      <PageHeader
        icon={<DatabaseIcon size={19} />}
        eyebrow="Plataforma"
        title="Todas as Contas"
        subtitle="Plano, faturamento, limites e acesso de suporte de cada conta do Eixo."
      />

      {error && <div className="alert alert-error">{error}</div>}

      {sessions.length > 0 && (
        <section className="panel platform-sessions">
          <div className="panel-header">
            <h2>Sessões de suporte abertas agora</h2>
          </div>
          <ul className="platform-session-list">
            {sessions.map((s) => (
              <li key={s.id}>
                <span>
                  <strong>{s.account.name}</strong> · pedida por {s.requestedBy.name} · expira {formatDateTime(s.expiresAt)}
                  {s.reason && <> · {s.reason}</>}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => void forceEnd(s.id)}>
                  Encerrar agora
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="card table-wrap">
        <table className="fin-table platform-table ds-table-cards">
          <thead>
            <tr>
              <th>Conta</th>
              <th>Status</th>
              <th>Plano</th>
              <th>Usuários</th>
              <th>Veículos</th>
              <th>Próxima cobrança</th>
              <th className="right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const usersLimit = a.limits?.items.find((i) => i.resource === 'users');
              const vehiclesLimit = a.limits?.items.find((i) => i.resource === 'vehicles');
              return (
                <tr key={a.id}>
                  <td className="ds-cell-title">{a.name}</td>
                  <td data-label="Status">
                    <span className={`badge status-${a.status.toLowerCase()}`}>{STATUS_LABEL[a.status]}</span>
                  </td>
                  <td data-label="Plano">
                    {a.plan ? (
                      <>
                        {a.plan.name} · {brl(a.subscription?.priceCents ?? a.plan.priceCents)}
                      </>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td data-label="Usuários">{usersLimit ? `${usersLimit.used}/${usersLimit.max}` : a.activeUsers}</td>
                  <td data-label="Veículos">{vehiclesLimit ? `${vehiclesLimit.used}/${vehiclesLimit.max}` : '-'}</td>
                  <td data-label="Próxima cobrança">
                    {a.subscription?.nextDueDate ? formatDate(a.subscription.nextDueDate) : '-'}
                  </td>
                  <td className="right ds-cell-actions">
                    <div className="row-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => void openDetail(a.id)}>
                        Detalhes
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() =>
                          setSessionModal({ accountId: a.id, accountName: a.name, reason: '', durationMinutes: 60 })
                        }
                      >
                        <ShieldIcon size={14} /> Acessar como suporte
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {loading &&
              accounts.length === 0 &&
              Array.from({ length: 3 }, (_, i) => (
                <tr key={`sk-${i}`} aria-hidden="true">
                  <td colSpan={7} className="ds-skeleton-row">
                    <span className="ds-skeleton" style={{ height: 18 }} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {sessionModal && (
        <div className="modal-backdrop" onClick={() => setSessionModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Acessar como suporte - {sessionModal.accountName}</h2>
              <button className="icon-btn" onClick={() => setSessionModal(null)} aria-label="Fechar">
                <XIcon size={16} />
              </button>
            </div>
            <form className="modal-body" onSubmit={startSession}>
              <p className="muted small">
                Cria um usuário administrador temporário dentro desta conta, visível para o lojista na lista de
                usuários. A sessão abre numa aba nova e expira sozinha no tempo escolhido.
              </p>
              <label className="field">
                <span>Motivo (opcional)</span>
                <input
                  value={sessionModal.reason}
                  onChange={(e) => setSessionModal({ ...sessionModal, reason: e.target.value })}
                  placeholder="Ex.: chamado #123"
                  maxLength={500}
                  autoFocus
                />
              </label>
              <label className="field">
                <span>Duração</span>
                <select
                  value={sessionModal.durationMinutes}
                  onChange={(e) => setSessionModal({ ...sessionModal, durationMinutes: Number(e.target.value) })}
                >
                  <option value={30}>30 minutos</option>
                  <option value={60}>1 hora</option>
                  <option value={120}>2 horas</option>
                </select>
              </label>
              {error && <p className="form-error">{error}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setSessionModal(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={starting}>
                  {starting ? 'Abrindo…' : 'Abrir sessão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {(detail || detailLoading) && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{detail?.name ?? 'Carregando…'}</h2>
              <button className="icon-btn" onClick={() => setDetail(null)} aria-label="Fechar">
                <XIcon size={16} />
              </button>
            </div>
            <div className="modal-body">
              {detail && (
                <>
                  <h3 className="platform-detail-heading">Usuários</h3>
                  <ul className="platform-detail-list">
                    {detail.users.map((u) => (
                      <li key={u.id}>
                        {u.name} · {u.email} · {u.profile?.name ?? u.role}
                        {!u.active && ' · inativo'}
                      </li>
                    ))}
                    {detail.users.length === 0 && <li className="muted">Nenhum usuário.</li>}
                  </ul>
                  <h3 className="platform-detail-heading">Cobranças recentes</h3>
                  <ul className="platform-detail-list">
                    {detail.charges.map((c) => (
                      <li key={c.id}>
                        {formatDate(c.dueDate)} · {brl(c.amountCents)} · {c.status}
                      </li>
                    ))}
                    {detail.charges.length === 0 && <li className="muted">Nenhuma cobrança ainda.</li>}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
