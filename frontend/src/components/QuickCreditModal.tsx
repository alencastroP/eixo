import { useState } from 'react';
import { creditApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import type { CreditReport } from '../types';
import { formatBRL } from '../utils/format';
import { ScoreGauge } from './ScoreGauge';
import { AlertIcon, CheckIcon } from './icons';

interface Props {
  document: string;
  leadId: string;
  onClose: () => void;
}

/**
 * Diagnóstico de crédito compacto em pop-up, sobre a tela do chat.
 *
 * Consultar exige um lead (já garantido pelo chamador) e a confirmação de que
 * o cliente autorizou - por isso a consulta não dispara ao abrir o pop-up:
 * primeiro pede a confirmação, só então chama a API.
 */
export function QuickCreditModal({ document, leadId, onClose }: Props) {
  const [report, setReport] = useState<CreditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentConfirmed, setConsentConfirmed] = useState(false);

  const runQuery = () => {
    if (!consentConfirmed) return;
    setLoading(true);
    setError(null);
    creditApi
      .query(document, { leadId, consentConfirmed: true, consentSource: 'whatsapp' })
      .then((q) => setReport(q.report))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Falha na consulta'))
      .finally(() => setLoading(false));
  };

  const bandClass = report
    ? report.band === 'LOW_RISK'
      ? 'band-low'
      : report.band === 'MEDIUM_RISK'
        ? 'band-medium'
        : 'band-high'
    : '';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Consulta de Score</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="modal-body quick-credit">
          {!report && !loading && (
            <>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={consentConfirmed}
                  onChange={(e) => setConsentConfirmed(e.target.checked)}
                />
                O cliente foi informado e <strong>autorizou</strong> esta consulta.
              </label>
              <button className="btn btn-primary btn-block" disabled={!consentConfirmed} onClick={runQuery}>
                Consultar
              </button>
            </>
          )}

          {loading && <div className="muted small">Consultando…</div>}
          {error && (
            <div className="alert alert-error">
              <AlertIcon size={14} /> {error}
            </div>
          )}

          {report && (
            <>
              {report.source === 'mock' && (
                <div className="alert alert-warning">
                  <AlertIcon size={14} /> <strong>Simulado</strong> - sem consulta a bureau real, sem validade para
                  decisão de crédito.
                </div>
              )}

              <div className="quick-credit-head">
                <strong>{report.name}</strong>
                <span className="muted small">
                  {report.docType} {report.document}
                </span>
              </div>

              <div className="quick-gauge">
                <ScoreGauge score={report.score} band={report.band} size={220} />
                <div className="gauge-readout">
                  <span className={`gauge-score ${bandClass}`}>{report.score}</span>
                  <span className="gauge-band">{report.bandLabel}</span>
                </div>
              </div>

              <div className="quick-credit-rows">
                <div className="quick-row">
                  <span className={`quick-icon ${report.restrictions.hasRestrictions ? 'bad' : 'ok'}`}>
                    {report.restrictions.hasRestrictions ? <AlertIcon size={14} /> : <CheckIcon size={14} />}
                  </span>
                  <span>
                    {report.restrictions.hasRestrictions
                      ? `${report.restrictions.protests + report.restrictions.negativacoes} restrições ativas`
                      : 'Sem restrições ativas'}
                  </span>
                </div>
                <div className="quick-row">
                  <span className="quick-label">Limite estimado</span>
                  <strong className="band-low">{report.credit.limit > 0 ? formatBRL(report.credit.limit) : 'Não liberado'}</strong>
                </div>
                <div className="quick-row">
                  <span className="quick-label">Entrada recomendada</span>
                  <strong>{report.credit.downPaymentPct}%</strong>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
