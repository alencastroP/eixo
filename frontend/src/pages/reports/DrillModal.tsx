import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftIcon, ChevronRightIcon, SearchDataIcon } from '../../components/icons';
import { ReportChart } from './ReportChart';
import { DataTable } from './DataTable';
import {
  computeReport,
  effectiveDimension,
  getField,
  type ChartType,
  type DrillStep,
  type FilterCond,
  type MetricConfig,
  type ModuleSchema,
  type SortConfig,
  type ValueFormat,
} from './reportEngine';

interface Props {
  module: ModuleSchema;
  baseDimension: string;
  metric: MetricConfig;
  filters: FilterCond[];
  sort: SortConfig;
  chartType: ChartType;
  metricName: string;
  metricFormat: ValueFormat;
  /** Passo inicial: o valor clicado na visão principal (nível base). */
  initialStep: DrillStep;
  onClose: () => void;
}

export function DrillModal({
  module,
  baseDimension,
  metric,
  filters,
  sort,
  chartType,
  metricName,
  metricFormat,
  initialStep,
  onClose,
}: Props) {
  const [drill, setDrill] = useState<DrillStep[]>([initialStep]);

  // Esc fecha o modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const baseDimField = getField(module, baseDimension);
  const effDim = effectiveDimension(module, baseDimension, drill);
  const effDimField = getField(module, effDim);
  const canDrill = !!effDimField?.drillTo;
  const childLabel = effDimField?.drillTo ? getField(module, effDimField.drillTo)?.label : null;

  const rows = useMemo(
    () => computeReport(module, effDim, metric, filters, drill, sort),
    [module, effDim, metric, filters, drill, sort],
  );

  const onDrill = (key: string) => {
    if (!canDrill || !effDimField) return;
    setDrill((d) => [...d, { field: effDim, fieldLabel: effDimField.label, value: key }]);
  };
  /** Nível 0 = visão principal → fecha o modal; níveis ≥1 navegam dentro dele. */
  const goToLevel = (n: number) => (n <= 0 ? onClose() : setDrill((d) => d.slice(0, n)));

  const filename = `relatorio-${module.key}-${effDim}-${drill.map((s) => s.value).join('-')}`;
  const current = drill[drill.length - 1];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-xl drill-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header drill-modal-header">
          <div className="drill-modal-title">
            <span className="drill-modal-icon">
              <SearchDataIcon size={17} />
            </span>
            <div>
              <h2>Detalhamento · {current.value}</h2>
              <span className="drill-modal-sub">
                {module.label} — agrupado por <strong>{effDimField?.label}</strong>
              </span>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>

        {/* Trilha de navegação do drill down */}
        <div className="drill-modal-nav">
          <nav className="report-breadcrumbs" aria-label="Navegação do drill down">
            <button className="report-crumb" onClick={() => goToLevel(0)} title="Voltar à visão geral">
              {module.label} · {baseDimField?.label}
            </button>
            {drill.map((step, i) => (
              <span key={i} className="report-crumb-group">
                <ChevronRightIcon size={13} />
                <button
                  className={`report-crumb ${i === drill.length - 1 ? 'current' : ''}`}
                  onClick={() => goToLevel(i + 1)}
                >
                  {step.value}
                </button>
              </span>
            ))}
          </nav>
          <button className="btn btn-ghost btn-sm report-back" onClick={() => goToLevel(drill.length - 1)}>
            <ArrowLeftIcon size={14} /> Voltar
          </button>
        </div>

        <div className="modal-body drill-modal-body">
          {canDrill && childLabel && (
            <p className="drill-modal-hint">
              Clique em um item para abrir <strong>{childLabel}</strong>.
            </p>
          )}

          {chartType !== 'table' && (
            <section className="panel report-chart-panel">
              <div className="panel-header">
                <h2>{metricName}</h2>
                <span className="muted small">{rows.length} grupos</span>
              </div>
              <ReportChart
                chartType={chartType}
                data={rows}
                metricFormat={metricFormat}
                metricName={metricName}
                canDrill={canDrill}
                onDrill={onDrill}
              />
            </section>
          )}

          <DataTable
            rows={rows}
            dimensionLabel={effDimField?.label ?? 'Dimensão'}
            metricName={metricName}
            metricFormat={metricFormat}
            canDrill={canDrill}
            onDrill={onDrill}
            filename={filename}
          />
        </div>
      </div>
    </div>
  );
}
