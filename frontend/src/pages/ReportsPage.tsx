import { useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { BarChartIcon, EditIcon, PlusIcon, TrashIcon } from '../components/icons';
import { ConfigPanel } from './reports/ConfigPanel';
import { DataTable } from './reports/DataTable';
import { DrillModal } from './reports/DrillModal';
import { ReportChart } from './reports/ReportChart';
import { ReportFormModal } from './reports/ReportFormModal';
import {
  COUNT_KEY,
  computeReport,
  defaultConfig,
  getField,
  getModule,
  metricLabel,
  type DrillStep,
  type ReportConfig,
  type SavedReport,
} from './reports/reportEngine';

function makeReport(name: string, moduleKey: string): SavedReport {
  return { id: Math.random().toString(36).slice(2, 9), name, config: defaultConfig(moduleKey) };
}

export function ReportsPage() {
  const [reports, setReports] = useState<SavedReport[]>(() => [makeReport('Vendas por estado', 'vendas')]);
  const [activeId, setActiveId] = useState(() => reports[0].id);
  /** null = modal fechado; 'new' = criando; SavedReport = editando esse relatório. */
  const [formTarget, setFormTarget] = useState<'new' | SavedReport | null>(null);
  /** Passo inicial do drill down (valor clicado) — null = modal fechado. */
  const [drillStep, setDrillStep] = useState<DrillStep | null>(null);

  const active = reports.find((r) => r.id === activeId) ?? reports[0];
  const config = active.config;

  const module = getModule(config.moduleKey);
  const baseDimField = getField(module, config.dimension);
  const canDrill = !!baseDimField?.drillTo;
  const childLabel = baseDimField?.drillTo ? getField(module, baseDimField.drillTo)?.label : null;

  const metricField = config.metric.field === COUNT_KEY ? undefined : getField(module, config.metric.field);
  const metricName = metricLabel(metricField, config.metric.agg);
  const metricFormat = metricField?.format ?? 'number';

  // Visão principal: sempre no nível base (o aprofundamento acontece no modal).
  const rows = useMemo(
    () => computeReport(module, config.dimension, config.metric, config.filters, [], config.sort),
    [module, config.dimension, config.metric, config.filters, config.sort],
  );

  const updateActive = (patch: Partial<ReportConfig>) =>
    setReports((rs) => rs.map((r) => (r.id === activeId ? { ...r, config: { ...r.config, ...patch } } : r)));

  const changeModule = (key: string) =>
    setReports((rs) => rs.map((r) => (r.id === activeId ? { ...r, config: defaultConfig(key) } : r)));
  const patchConfig = (patch: Partial<ReportConfig>) => updateActive(patch);

  const selectReport = (id: string) => setActiveId(id);
  /** Cria (id novo) ou substitui (id existente) — o mesmo modal serve para os dois fluxos. */
  const saveReport = (report: SavedReport) => {
    setReports((rs) => (rs.some((r) => r.id === report.id) ? rs.map((r) => (r.id === report.id ? report : r)) : [...rs, report]));
    setActiveId(report.id);
  };
  const removeReport = (id: string) => {
    const target = reports.find((r) => r.id === id);
    if (target && !window.confirm(`Excluir o relatório "${target.name}"?`)) return;
    setReports((rs) => {
      const next = rs.filter((r) => r.id !== id);
      if (id === activeId && next.length) setActiveId(next[0].id);
      return next;
    });
  };

  /** Clique numa barra/linha/fatia/linha da tabela → abre o modal de drill down. */
  const onDrill = (key: string) => {
    if (!canDrill || !baseDimField) return;
    setDrillStep({ field: config.dimension, fieldLabel: baseDimField.label, value: key });
  };

  const filename = `relatorio-${module.key}-${config.dimension}`;

  return (
    <div className="dash report-page">
      <PageHeader
        icon={<BarChartIcon size={19} />}
        eyebrow="Relatórios & BI"
        title="Relatórios Customizados"
        subtitle="Cruze dados, filtre, escolha o gráfico e navegue em profundidade com drill down."
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setFormTarget('new')}>
            <PlusIcon size={16} /> Novo Relatório
          </button>
        }
      />

      {/* Abas dos relatórios criados */}
      <div className="report-tabs">
        {reports.map((r) => (
          <div key={r.id} className={`report-tab ${r.id === activeId ? 'active' : ''}`}>
            <button className="report-tab-name" onClick={() => selectReport(r.id)}>
              {r.name}
            </button>
            <button className="report-tab-action" onClick={() => setFormTarget(r)} aria-label="Editar relatório" title="Editar">
              <EditIcon size={12} />
            </button>
            {reports.length > 1 && (
              <button
                className="report-tab-action danger"
                onClick={() => removeReport(r.id)}
                aria-label="Excluir relatório"
                title="Excluir"
              >
                <TrashIcon size={12} />
              </button>
            )}
          </div>
        ))}
        <button className="report-tab-add" onClick={() => setFormTarget('new')}>
          <PlusIcon size={14} /> Novo
        </button>
      </div>

      <div className="report-layout">
        <ConfigPanel module={module} config={config} onModuleChange={changeModule} onChange={patchConfig} />

        <div className="report-view">
          {/* Contexto do nível base (o aprofundamento abre em modal) */}
          <div className="report-view-head">
            <span className="report-grouped">
              {module.label} · agrupado por <strong>{baseDimField?.label}</strong>
              {canDrill && childLabel && (
                <span className="report-drill-hint"> · clique para detalhar em {childLabel}</span>
              )}
            </span>
          </div>

          {/* Gráfico principal */}
          {config.chartType !== 'table' && (
            <section className="panel report-chart-panel">
              <div className="panel-header">
                <h2>{metricName}</h2>
                <span className="muted small">{rows.length} grupos</span>
              </div>
              <ReportChart
                chartType={config.chartType}
                data={rows}
                metricFormat={metricFormat}
                metricName={metricName}
                canDrill={canDrill}
                onDrill={onDrill}
              />
            </section>
          )}

          {/* Tabela analítica */}
          <DataTable
            rows={rows}
            dimensionLabel={baseDimField?.label ?? 'Dimensão'}
            metricName={metricName}
            metricFormat={metricFormat}
            canDrill={canDrill}
            onDrill={onDrill}
            filename={filename}
          />
        </div>
      </div>

      {formTarget && (
        <ReportFormModal
          initial={formTarget === 'new' ? undefined : formTarget}
          onClose={() => setFormTarget(null)}
          onSave={saveReport}
        />
      )}

      {drillStep && (
        <DrillModal
          module={module}
          baseDimension={config.dimension}
          metric={config.metric}
          filters={config.filters}
          sort={config.sort}
          chartType={config.chartType}
          metricName={metricName}
          metricFormat={metricFormat}
          initialStep={drillStep}
          onClose={() => setDrillStep(null)}
        />
      )}
    </div>
  );
}
