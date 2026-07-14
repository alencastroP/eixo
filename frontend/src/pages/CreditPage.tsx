import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { creditApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { LinkLeadModal } from '../components/LinkLeadModal';
import { ScoreGauge } from '../components/ScoreGauge';
import {
  AlertIcon,
  CheckIcon,
  CoinsIcon,
  FileTextIcon,
  LinkIcon,
  SearchDataIcon,
  ShieldIcon,
  TrendUpIcon,
} from '../components/icons';
import type { CreditQuery, ScoreBand } from '../types';
import { formatBRL, formatDateTime, formatDocumentInput } from '../utils/format';

const BAND_CLASS: Record<ScoreBand, string> = {
  HIGH_RISK: 'band-high',
  MEDIUM_RISK: 'band-medium',
  LOW_RISK: 'band-low',
};

/** Item de restrição com badge semântico (verde quando zero, vermelho/âmbar quando há). */
function RestrictionRow({ label, count, amber }: { label: string; count: number; amber?: boolean }) {
  const clean = count === 0;
  return (
    <div className="restriction-row">
      <span className={`restriction-icon ${clean ? 'ok' : amber ? 'warn' : 'bad'}`}>
        {clean ? <CheckIcon size={15} /> : <AlertIcon size={15} />}
      </span>
      <span className="restriction-label">{label}</span>
      <span className={`restriction-badge ${clean ? 'ok' : amber ? 'warn' : 'bad'}`}>
        {clean ? 'Nenhuma' : count === 1 ? '1 ocorrência' : `${count} ocorrências`}
      </span>
    </div>
  );
}

export function CreditPage() {
  const [docInput, setDocInput] = useState('');
  const [result, setResult] = useState<CreditQuery | null>(null);
  const [recent, setRecent] = useState<CreditQuery[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  const loadRecent = useCallback(() => {
    creditApi
      .recent()
      .then(setRecent)
      .catch(() => setRecent([]));
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const runQuery = async (e: FormEvent) => {
    e.preventDefault();
    const digits = docInput.replace(/\D/g, '');
    if (digits.length !== 11 && digits.length !== 14) {
      setError('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const q = await creditApi.query(docInput);
      setResult(q);
      loadRecent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha na consulta');
    } finally {
      setLoading(false);
    }
  };

  const openReport = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      setResult(await creditApi.get(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao abrir relatório');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setDocInput('');
    setError(null);
    loadRecent();
  };

  // ─── Tela 2: painel de diagnóstico ───
  if (result) {
    const r = result.report;
    return (
      <div className="dash credit-page">
        <PageHeader
          icon={<ShieldIcon size={19} />}
          eyebrow="Análise de Crédito"
          title={r.name}
          subtitle={`${r.docType} ${r.document} · consultado em ${formatDateTime(r.queriedAt)}`}
          actions={
            <button className="btn btn-ghost btn-sm" onClick={reset}>
              <SearchDataIcon size={15} /> Nova consulta
            </button>
          }
        />

        <div className="credit-report" id="credit-report">
          {result.lead && (
            <div className="alert alert-info credit-linked">
              <LinkIcon size={14} /> Vinculado ao lead <strong>{result.lead.name}</strong>
            </div>
          )}

          <div className="credit-grid">
            {/* BLOCO 1 — Velocímetro */}
            <section className="panel gauge-panel">
              <div className="panel-header">
                <h2>Score de Crédito</h2>
              </div>
              <div className="gauge-wrap">
                <ScoreGauge score={r.score} band={r.band} />
                <div className="gauge-readout">
                  <span className={`gauge-score ${BAND_CLASS[r.band]}`}>{r.score}</span>
                  <span className="gauge-band">{r.bandLabel}</span>
                </div>
                <p className="gauge-headline">{r.headline}</p>
              </div>
            </section>

            {/* BLOCO 2 — Restrições */}
            <section className="panel restrictions-panel">
              <div className="panel-header">
                <h2>Saúde Financeira</h2>
                <span className={`badge ${r.restrictions.hasRestrictions ? 'credit-pill-bad' : 'credit-pill-ok'}`}>
                  {r.restrictions.hasRestrictions ? 'Restrições ativas' : 'Sem restrições'}
                </span>
              </div>

              <div className="restrictions-list">
                <RestrictionRow label="Protestos" count={r.restrictions.protests} />
                <RestrictionRow label="Negativações" count={r.restrictions.negativacoes} />
                <RestrictionRow label="Cheques sem fundo" count={r.restrictions.badChecks} amber />
                <RestrictionRow label="Ações judiciais" count={r.restrictions.judicialActions} />
              </div>

              {r.restrictions.totalAmount > 0 && (
                <div className="restrictions-total">
                  <span>Valor total em pendências</span>
                  <strong className="band-high">{formatBRL(r.restrictions.totalAmount)}</strong>
                </div>
              )}

              {r.company && (
                <div className={`company-status ${r.company.active ? 'active' : 'inactive'}`}>
                  <span className="company-icon">{r.company.active ? <CheckIcon size={15} /> : <AlertIcon size={15} />}</span>
                  <div>
                    <strong>{r.company.situation}</strong>
                    <span className="muted small">Empresa aberta em {r.company.openedYear}</span>
                  </div>
                </div>
              )}
            </section>

            {/* BLOCO 3 — Estimativa de crédito */}
            <section className="panel credit-estimate-panel">
              <div className="panel-header">
                <h2>Potencial de Compra</h2>
                <CoinsIcon size={17} />
              </div>

              <div className="credit-limit">
                <span className="credit-limit-label">Limite de financiamento estimado</span>
                <span className="credit-limit-value">{r.credit.limit > 0 ? formatBRL(r.credit.limit) : 'Não liberado'}</span>
              </div>

              {r.credit.limit > 0 && (
                <div className="credit-detail-row">
                  <TrendUpIcon size={15} />
                  <span>Parcela estimada em 48x: <strong>{formatBRL(r.credit.installmentEstimate)}</strong></span>
                </div>
              )}

              <div
                className={`down-payment ${
                  r.credit.downPaymentPct === 0 ? 'ok' : r.credit.downPaymentPct <= 20 ? 'warn' : 'bad'
                }`}
              >
                <span className="down-payment-pct">{r.credit.downPaymentPct}%</span>
                <span className="down-payment-label">{r.credit.downPaymentLabel}</span>
              </div>
            </section>
          </div>

          {/* CTAs de rodapé */}
          <div className="credit-actions no-print">
            <button className="btn btn-ghost" onClick={() => setLinkOpen(true)}>
              <LinkIcon size={16} /> {result.lead ? 'Alterar vínculo' : 'Vincular a um Lead/Cliente'}
            </button>
            <button
              className="btn btn-ghost"
              title="Módulo de financiamento em desenvolvimento"
              onClick={() =>
                window.alert('O módulo de Financiamento ainda não está disponível. Os dados do cliente serão pré-carregados quando ele for lançado.')
              }
            >
              <CoinsIcon size={16} /> Iniciar Proposta de Financiamento
            </button>
            <button className="btn btn-primary" onClick={() => window.print()}>
              <FileTextIcon size={16} /> Exportar Relatório em PDF
            </button>
          </div>
        </div>

        {linkOpen && (
          <LinkLeadModal
            queryId={result.id}
            onClose={() => setLinkOpen(false)}
            onLinked={(updated) => {
              setResult(updated);
              loadRecent();
            }}
          />
        )}
      </div>
    );
  }

  // ─── Tela 1: busca ───
  return (
    <div className="dash credit-page">
      <PageHeader
        icon={<ShieldIcon size={19} />}
        eyebrow="Análise de Crédito"
        title="Consulta de Bureau"
        subtitle="Valide score, restrições e crédito liberado por CPF ou CNPJ."
      />

      <div className="credit-search-wrap">
        <form className="credit-search" onSubmit={runQuery}>
          <span className="credit-search-badge">
            <SearchDataIcon size={24} />
          </span>
          <h2 className="credit-search-title">Consultar perfil de crédito</h2>
          <p className="credit-search-hint">
            Digite o documento para receber score, restrições e limite estimado em segundos.
          </p>
          <label className="credit-search-label">CPF ou CNPJ</label>
          <div className="credit-search-row">
            <input
              className="credit-doc-input"
              value={docInput}
              onChange={(e) => setDocInput(formatDocumentInput(e.target.value))}
              placeholder="000.000.000-00"
              inputMode="numeric"
              autoFocus
            />
            <button type="submit" className="btn btn-primary credit-submit" disabled={loading}>
              <SearchDataIcon size={17} /> {loading ? 'Consultando…' : 'Consultar Perfil'}
            </button>
          </div>
          {error && <p className="form-error credit-search-error">{error}</p>}
        </form>

        {recent.length > 0 && (
          <div className="recent-queries">
            <div className="recent-title">Consultas recentes</div>
            <div className="recent-list">
              {recent.map((q) => (
                <button key={q.id} className="recent-item" onClick={() => openReport(q.id)}>
                  <span className="recent-name">{q.report.name}</span>
                  <span className="recent-doc muted small">{q.report.document}</span>
                  <span className="recent-date muted small">{formatDateTime(q.createdAt)}</span>
                  <span className={`recent-score ${BAND_CLASS[q.report.band]}`}>{q.score}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
