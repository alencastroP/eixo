import { ChevronRightIcon, DownloadIcon } from '../../components/icons';
import { formatMetric, toCsv, type ReportRow, type ValueFormat } from './reportEngine';

interface Props {
  rows: ReportRow[];
  dimensionLabel: string;
  metricName: string;
  metricFormat: ValueFormat;
  canDrill: boolean;
  onDrill: (key: string) => void;
  filename: string;
}

export function DataTable({ rows, dimensionLabel, metricName, metricFormat, canDrill, onDrill, filename }: Props) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0) || 1;

  const exportCsv = () => {
    const csv = toCsv(rows, dimensionLabel, metricName);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel report-table-panel">
      <div className="panel-header">
        <h2>Dados analíticos</h2>
        <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={rows.length === 0}>
          <DownloadIcon size={15} /> Exportar CSV
        </button>
      </div>

      <div className="table-wrap">
        <table className="fin-table report-table">
          <thead>
            <tr>
              <th>{dimensionLabel}</th>
              <th className="right">{metricName}</th>
              <th className="report-share-col">Participação</th>
              <th className="right">%</th>
              {canDrill && <th aria-label="Detalhar" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pct = total ? (r.value / total) * 100 : 0;
              return (
                <tr
                  key={r.key}
                  className={canDrill ? 'report-row-drill' : ''}
                  onClick={canDrill ? () => onDrill(r.key) : undefined}
                >
                  <td className="report-cell-label">{r.label}</td>
                  <td className="right amount">{formatMetric(r.value, metricFormat)}</td>
                  <td className="report-share-col">
                    <span className="report-share-track">
                      <span className="report-share-bar" style={{ width: `${(r.value / max) * 100}%` }} />
                    </span>
                  </td>
                  <td className="right muted">{pct.toFixed(1)}%</td>
                  {canDrill && (
                    <td className="right">
                      <ChevronRightIcon size={15} />
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={canDrill ? 5 : 4} className="empty-row">
                  Nenhum dado para os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td className="report-cell-label">Total ({rows.length})</td>
                <td className="right amount">{formatMetric(total, metricFormat)}</td>
                <td className="report-share-col" />
                <td className="right muted">100%</td>
                {canDrill && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
