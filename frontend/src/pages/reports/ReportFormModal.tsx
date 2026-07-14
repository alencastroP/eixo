import { useState } from 'react';
import { BarChartIcon, LineChartIcon, PieChartIcon, TableIcon } from '../../components/icons';
import { FilterBuilder } from './FilterBuilder';
import {
  COUNT_KEY,
  defaultConfig,
  dimensions,
  getField,
  getModule,
  metrics,
  MODULES,
  type Agg,
  type ChartType,
  type FilterCond,
  type MetricConfig,
  type SavedReport,
} from './reportEngine';

interface Props {
  /** Presente = edição de um relatório existente; ausente = criação. */
  initial?: SavedReport;
  onClose: () => void;
  onSave: (report: SavedReport) => void;
}

const CHART_TYPES: Array<{ key: ChartType; label: string; icon: JSX.Element }> = [
  { key: 'bar', label: 'Barras', icon: <BarChartIcon size={20} /> },
  { key: 'line', label: 'Linha/Área', icon: <LineChartIcon size={20} /> },
  { key: 'pie', label: 'Rosca', icon: <PieChartIcon size={20} /> },
  { key: 'table', label: 'Tabela', icon: <TableIcon size={20} /> },
];

export function ReportFormModal({ initial, onClose, onSave }: Props) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [moduleKey, setModuleKey] = useState(initial?.config.moduleKey ?? 'vendas');
  const [chartType, setChartType] = useState<ChartType>(initial?.config.chartType ?? 'bar');
  const [dimension, setDimension] = useState(initial?.config.dimension ?? dimensions(getModule('vendas'))[0].key);
  const [metric, setMetric] = useState<MetricConfig>(initial?.config.metric ?? { field: COUNT_KEY, agg: 'count' });
  const [filters, setFilters] = useState<FilterCond[]>(initial?.config.filters ?? []);

  const module = getModule(moduleKey);
  const dims = dimensions(module);
  const mets = metrics(module);
  const metricField = metric.field === COUNT_KEY ? undefined : getField(module, metric.field);
  const metricAggs: Agg[] = metricField?.aggs ?? ['count'];

  // trocar de módulo reinicia os campos dependentes
  const changeModule = (key: string) => {
    const base = defaultConfig(key);
    setModuleKey(key);
    setDimension(base.dimension);
    setMetric(base.metric);
    setFilters([]);
  };

  const save = () => {
    const dimLabel = getField(module, dimension)?.label ?? module.label;
    const report: SavedReport = {
      id: initial?.id ?? Math.random().toString(36).slice(2, 9),
      name: name.trim() || `${module.label} · ${dimLabel}`,
      config: {
        moduleKey,
        dimension,
        metric,
        filters,
        sort: initial?.config.sort ?? { by: 'value', dir: 'desc' },
        chartType,
      },
    };
    onSave(report);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEdit ? 'Editar Relatório' : 'Criar Relatório'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>

        <div className="modal-body report-new">
          <label className="field">
            <span>Nome do relatório</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Faturamento por estado"
              autoFocus
            />
          </label>

          <div className="report-new-block">
            <span className="report-new-label">Módulo base</span>
            <div className="report-module-grid">
              {MODULES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className={`report-module-btn ${m.key === moduleKey ? 'active' : ''}`}
                  onClick={() => changeModule(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="report-new-block">
            <span className="report-new-label">Tipo de gráfico</span>
            <div className="report-chart-types">
              {CHART_TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`report-chart-type ${chartType === t.key ? 'active' : ''}`}
                  onClick={() => setChartType(t.key)}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field-row">
            <label className="field">
              <span>Dimensão · Agrupar por (X)</span>
              <select value={dimension} onChange={(e) => setDimension(e.target.value)}>
                {dims.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                    {f.drillTo ? '  ↳ drill' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Métrica · Valor (Y)</span>
              <select
                value={metric.field}
                onChange={(e) => {
                  const field = e.target.value;
                  const fld = getField(module, field);
                  const agg: Agg = field === COUNT_KEY ? 'count' : fld?.aggs?.[0] ?? 'sum';
                  setMetric({ field, agg });
                }}
              >
                <option value={COUNT_KEY}>Contagem de registros</option>
                {mets.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {metricField && metricAggs.length > 1 && (
            <div className="report-agg-toggle">
              {metricAggs.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={metric.agg === a ? 'active' : ''}
                  onClick={() => setMetric({ ...metric, agg: a })}
                >
                  {a === 'sum' ? 'Somar' : a === 'avg' ? 'Média' : 'Contar'}
                </button>
              ))}
            </div>
          )}

          <div className="report-new-block">
            <span className="report-new-label">Filtros (opcional)</span>
            <FilterBuilder module={module} filters={filters} onChange={setFilters} />
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            <BarChartIcon size={16} /> {isEdit ? 'Salvar Alterações' : 'Criar Relatório'}
          </button>
        </div>
      </div>
    </div>
  );
}
