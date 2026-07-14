import { useEffect, useState } from 'react';
import { creditApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import type { CreditReport } from '../types';
import { formatBRL } from '../utils/format';
import { ScoreGauge } from './ScoreGauge';
import { AlertIcon, CheckIcon } from './icons';

interface Props {
  document: string;
  onClose: () => void;
}

/** Diagnóstico de crédito compacto em pop-up, sobre a tela do chat. */
export function QuickCreditModal({ document, onClose }: Props) {
  const [report, setReport] = useState<CreditReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    creditApi
      .query(document)
      .then((q) => setReport(q.report))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Falha na consulta'))
      .finally(() => setLoading(false));
  }, [document]);

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
          {loading && <div className="muted small">Consultando bureau…</div>}
          {error && (
            <div className="alert alert-error">
              <AlertIcon size={14} /> {error}
            </div>
          )}

          {report && (
            <>
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
