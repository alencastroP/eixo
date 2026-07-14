import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ticketsApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { GaugeIcon, RefreshIcon, TrendUpIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import {
  ROLE_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  platformLabel,
  type TicketMetrics,
  type TicketStatus,
} from '../types';
import { formatDurationShort, formatPercent } from '../utils/format';

const FUNNEL: TicketStatus[] = ['NEW', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'CONVERTED', 'LOST', 'ARCHIVED'];

/** Mini medidor circular (tacômetro) para a taxa de conversão. */
function Gauge({ ratio, label }: { ratio: number; label: string }) {
  const pct = Math.max(0, Math.min(1, ratio));
  const R = 34;
  const C = 2 * Math.PI * R;
  return (
    <div className="gauge">
      <svg viewBox="0 0 80 80" width="92" height="92">
        <circle cx="40" cy="40" r={R} className="gauge-track" />
        <circle
          cx="40"
          cy="40"
          r={R}
          className="gauge-fill"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
          transform="rotate(-90 40 40)"
        />
      </svg>
      <div className="gauge-center">
        <span className="gauge-value">{formatPercent(ratio)}</span>
        <span className="gauge-label">{label}</span>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<TicketMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState(30);

  const load = (days: number) => {
    setLoading(true);
    ticketsApi
      .metrics(days)
      .then((m) => {
        setMetrics(m);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Falha ao carregar métricas'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(windowDays);
  }, [windowDays]);

  const maxFunnel = metrics ? Math.max(1, ...FUNNEL.map((s) => metrics.byStatus[s] ?? 0)) : 1;
  const maxPlatform = metrics ? Math.max(1, ...metrics.byPlatform.map((p) => p.count)) : 1;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <div className="dash">
      <PageHeader
        icon={<GaugeIcon size={19} />}
        eyebrow="Painel"
        title={`${greeting}, ${user?.name.split(' ')[0] ?? ''}`}
        subtitle={`${user ? ROLE_LABELS[user.role] : ''} · atendimento dos últimos ${windowDays} dias`}
        actions={
          <>
            <div className="segmented">
              {[7, 30, 90].map((d) => (
                <button key={d} className={windowDays === d ? 'active' : ''} onClick={() => setWindowDays(d)}>
                  {d}d
                </button>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => load(windowDays)} disabled={loading}>
              <RefreshIcon size={15} />
              {loading ? '…' : 'Atualizar'}
            </button>
          </>
        }
      />

      {error && <div className="alert alert-error">{error}</div>}

      {metrics && (
        <>
          {/* ── 3 cards de métricas principais ── */}
          <div className="kpi-grid">
            <div className="kpi-card kpi-accent">
              <div className="kpi-top">
                <span className="kpi-icon accent">
                  <TrendUpIcon size={18} />
                </span>
                <span className="kpi-title">Taxa de conversão</span>
              </div>
              <div className="kpi-with-gauge">
                <Gauge ratio={metrics.conversionRate} label="fechados" />
                <div className="kpi-side">
                  <div className="kpi-side-row success">
                    <strong>{metrics.converted}</strong> convertidos
                  </div>
                  <div className="kpi-side-row danger">
                    <strong>{metrics.lost}</strong> perdidos
                  </div>
                </div>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-top">
                <span className="kpi-icon info">
                  <GaugeIcon size={18} />
                </span>
                <span className="kpi-title">Tempo médio de 1ª resposta</span>
              </div>
              <div className="kpi-value">{formatDurationShort(metrics.avgFirstResponseSeconds)}</div>
              <div className="kpi-foot">
                Meta SLA: {metrics.slaLimitMinutes} min ·{' '}
                <span className={metrics.slaBreachedNow > 0 ? 'danger' : 'success'}>
                  {metrics.slaBreachedNow} estourados agora
                </span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-top">
                <span className="kpi-icon warning">
                  <span className="pulse-dot" />
                </span>
                <span className="kpi-title">Tickets em aberto</span>
              </div>
              <div className="kpi-value">{metrics.openNow}</div>
              <div className="kpi-foot">
                {metrics.awaitingResponse} aguardando resposta · {metrics.createdInWindow} novos no período
              </div>
            </div>
          </div>

          {/* ── funil por status + por plataforma ── */}
          <div className="dash-grid">
            <section className="panel">
              <div className="panel-header">
                <h2>Funil por status</h2>
                <button className="link-btn" onClick={() => navigate('/kanban')}>
                  Ver kanban →
                </button>
              </div>
              <div className="funnel">
                {FUNNEL.map((s) => {
                  const count = metrics.byStatus[s] ?? 0;
                  return (
                    <button key={s} className="funnel-row" onClick={() => navigate(`/tickets?status=${s}`)}>
                      <span className={`dot status-dot-${s}`} />
                      <span className="funnel-label">{STATUS_LABELS[s]}</span>
                      <span className="funnel-bar-track">
                        <span className={`funnel-bar bar-${s}`} style={{ width: `${(count / maxFunnel) * 100}%` }} />
                      </span>
                      <span className="funnel-count">{count}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h2>Origem dos leads</h2>
                <span className="muted small">últimos {windowDays}d</span>
              </div>
              {metrics.byPlatform.length === 0 ? (
                <p className="muted small">Nenhum lead no período.</p>
              ) : (
                <div className="platform-list">
                  {metrics.byPlatform
                    .slice()
                    .sort((a, b) => b.count - a.count)
                    .map((p) => (
                      <button
                        key={p.platform}
                        className="platform-row"
                        onClick={() => navigate(`/tickets?platform=${p.platform}`)}
                      >
                        <span className="platform-name">{platformLabel(p.platform)}</span>
                        <span className="platform-bar-track">
                          <span className="platform-bar" style={{ width: `${(p.count / maxPlatform) * 100}%` }} />
                        </span>
                        <span className="platform-count">{p.count}</span>
                      </button>
                    ))}
                </div>
              )}
              <div className="panel-total">
                <span>Total geral</span>
                <strong>{metrics.totalAll} tickets</strong>
              </div>
            </section>
          </div>
        </>
      )}

      {loading && !metrics && <div className="dash-loading">Carregando painel…</div>}
    </div>
  );
}
