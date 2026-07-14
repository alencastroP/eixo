import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { integrationsApi } from '../api/endpoints';
import {
  INTEGRATION_STATUS_LABELS,
  platformLabel,
  type Integration,
  type IntegrationDetail,
} from '../types';
import { formatDateTime, timeAgo } from '../utils/format';
import { PlatformLogo } from './PlatformLogo';
import { IntegrationStatusBadge } from './badges';
import { AlertIcon, ArrowDownIcon, ArrowUpIcon, CheckIcon, ExternalIcon } from './icons';

interface Props {
  integration: Integration;
  onClose: () => void;
  onChanged: (detail: IntegrationDetail) => void;
}

export function IntegrationModal({ integration, onClose, onChanged }: Props) {
  const [detail, setDetail] = useState<IntegrationDetail | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | 'connect' | 'test' | 'sync' | 'disconnect'>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isConnected = detail ? detail.status === 'CONNECTED' || detail.status === 'DISABLED' : false;
  const hasAuthError = detail?.status === 'AUTH_ERROR';

  useEffect(() => {
    let cancelled = false;
    integrationsApi
      .get(integration.platform)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setForm(Object.fromEntries(d.credentialFields.map((f) => [f.key, ''])));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Falha ao carregar integração'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [integration.platform]);

  const apply = (d: IntegrationDetail) => {
    setDetail(d);
    onChanged(d);
  };

  const connect = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('connect');
    setError(null);
    try {
      apply(await integrationsApi.connect(integration.platform, form));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao conectar');
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    setError(null);
    try {
      apply(await integrationsApi.test(integration.platform));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao testar');
    } finally {
      setBusy(null);
    }
  };

  const toggleSync = async () => {
    if (!detail) return;
    setBusy('sync');
    setError(null);
    try {
      apply(await integrationsApi.setSync(integration.platform, !detail.syncEnabled));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao alterar sincronização');
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    if (!window.confirm(`Desconectar ${platformLabel(integration.platform)}? As credenciais serão removidas.`)) return;
    setBusy('disconnect');
    setError(null);
    try {
      const d = await integrationsApi.disconnect(integration.platform);
      apply(d);
      setForm(Object.fromEntries(d.credentialFields.map((f) => [f.key, ''])));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao desconectar');
    } finally {
      setBusy(null);
    }
  };

  const health = detail?.health;
  const outboundNote = useMemo(() => {
    if (!detail) return '';
    if (!detail.supportsOutbound) return 'Esta plataforma ainda não suporta envio de respostas pelo CRM.';
    if (!detail.syncEnabled) return 'Sincronização pausada — respostas não são replicadas.';
    return 'Respostas enviadas no CRM são replicadas ao cliente na plataforma.';
  }, [detail]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header integ-modal-header">
          <div className="integ-modal-title">
            <PlatformLogo platform={integration.platform} size={40} />
            <div>
              <h2>{integration.displayName}</h2>
              {detail && <IntegrationStatusBadge status={detail.status} />}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {loading && <div className="muted small">Carregando…</div>}

          {error && (
            <div className="alert alert-error">
              <AlertIcon size={14} /> {error}
            </div>
          )}
          {hasAuthError && detail?.lastError && !error && (
            <div className="alert alert-error">
              <AlertIcon size={14} /> {detail.lastError}
            </div>
          )}

          {detail && !isConnected && (
            <form onSubmit={connect}>
              <div className="integ-instructions">
                <strong>Como conectar</strong>
                <ol>
                  <li>Gere suas credenciais de API no painel de desenvolvedor da plataforma.</li>
                  <li>Cole os valores abaixo — eles ficam cifrados em repouso.</li>
                  <li>Ative a sincronização de mensagens para começar a receber leads.</li>
                </ol>
                {detail.docsUrl && (
                  <a href={detail.docsUrl} target="_blank" rel="noreferrer" className="doc-link">
                    Ver documentação <ExternalIcon size={13} />
                  </a>
                )}
              </div>

              {detail.credentialFields.map((f) => (
                <label className="field" key={f.key}>
                  <span>
                    {f.label} {f.required && <em className="req">*</em>}
                  </span>
                  <input
                    type={f.type}
                    value={form[f.key] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                    autoComplete="off"
                  />
                  {f.help && <span className="field-help">{f.help}</span>}
                </label>
              ))}

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={onClose}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy === 'connect'}>
                  {busy === 'connect' ? 'Conectando…' : 'Conectar Conta'}
                </button>
              </div>
            </form>
          )}

          {detail && isConnected && (
            <>
              <div className="integ-account">
                <span className="integ-account-icon">
                  <CheckIcon size={16} />
                </span>
                <div>
                  <strong>{detail.accountLabel ?? 'Conta conectada'}</strong>
                  <span className="muted small">
                    Conectada {detail.connectedAt ? timeAgo(detail.connectedAt) : ''} ·{' '}
                    {INTEGRATION_STATUS_LABELS[detail.status]}
                  </span>
                </div>
              </div>

              <div className="sync-row">
                <div>
                  <strong>Sincronização de mensagens</strong>
                  <span className="muted small">{outboundNote}</span>
                </div>
                <button
                  className={`switch ${detail.syncEnabled ? 'on' : ''}`}
                  onClick={toggleSync}
                  disabled={busy === 'sync'}
                  role="switch"
                  aria-checked={detail.syncEnabled}
                  title={detail.syncEnabled ? 'Desativar' : 'Ativar'}
                >
                  <span className="switch-knob" />
                </button>
              </div>

              {/* Fluxo visualizado */}
              {health && (
                <div className="flow">
                  <div className="flow-title">Fluxo de dados</div>
                  <div className="flow-cards">
                    <div className="flow-card">
                      <div className="flow-card-head in">
                        <ArrowDownIcon size={15} /> Entrada (leads → CRM)
                      </div>
                      <div className="flow-stat">
                        <strong>{health.inbound.received}</strong> recebidos
                      </div>
                      <div className="flow-sub">
                        {health.inbound.processed} viraram ticket · {health.inbound.failed} com falha
                      </div>
                      <div className="flow-sub muted">
                        {health.inbound.lastEventAt ? `último ${timeAgo(health.inbound.lastEventAt)}` : 'nenhum evento'}
                      </div>
                    </div>
                    <div className="flow-card">
                      <div className="flow-card-head out">
                        <ArrowUpIcon size={15} /> Saída (CRM → cliente)
                      </div>
                      <div className="flow-stat">
                        <strong>{health.outbound.sent}</strong> enviados
                      </div>
                      <div className="flow-sub">
                        {health.outbound.failed} falhas · {health.outbound.skipped} ignorados
                      </div>
                      <div className="flow-sub muted">
                        {detail.supportsOutbound ? 'bidirecional ativo' : 'somente recepção'}
                      </div>
                    </div>
                  </div>

                  {health.outbound.recent.length > 0 && (
                    <div className="flow-log">
                      <div className="flow-log-title">Últimos despachos</div>
                      {health.outbound.recent.map((d) => (
                        <div className="flow-log-row" key={d.id}>
                          <span className={`log-dot log-${d.status}`} />
                          <span className="log-detail">{d.detail ?? d.status}</span>
                          {d.externalRef && <span className="log-ref mono">{d.externalRef}</span>}
                          <span className="log-time muted">{formatDateTime(d.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="modal-actions between">
                <button className="btn btn-ghost danger-ghost" onClick={disconnect} disabled={busy === 'disconnect'}>
                  {busy === 'disconnect' ? 'Desconectando…' : 'Desconectar'}
                </button>
                <button className="btn btn-ghost" onClick={test} disabled={busy === 'test'}>
                  {busy === 'test' ? 'Testando…' : 'Testar conexão'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
