import {
  BarChartIcon,
  DatabaseIcon,
  FilterIcon,
  LineChartIcon,
  PieChartIcon,
  SlidersIcon,
  SortIcon,
  TableIcon,
} from '../../components/icons';
import { FilterBuilder } from './FilterBuilder';
import {
  COUNT_KEY,
  dimensions,
  getField,
  metrics,
  MODULES,
  type Agg,
  type ChartType,
  type ModuleSchema,
  type ReportConfig,
} from './reportEngine';

interface Props {
  module: ModuleSchema;
  config: ReportConfig;
  onModuleChange: (key: string) => void;
  onChange: (patch: Partial<ReportConfig>) => void;
}

const CHART_TYPES: Array<{ key: ChartType; label: string; icon: JSX.Element }> = [
  { key: 'bar', label: 'Barras', icon: <BarChartIcon size={20} /> },
  { key: 'line', label: 'Linha/Área', icon: <LineChartIcon size={20} /> },
  { key: 'pie', label: 'Rosca', icon: <PieChartIcon size={20} /> },
  { key: 'table', label: 'Tabela', icon: <TableIcon size={20} /> },
];

/** Bloco reutilizável: título com ícone + conteúdo. */
function Block({ icon, title, children, hint }: { icon: JSX.Element; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="report-block">
      <div className="report-block-head">
        <span className="report-block-icon">{icon}</span>
        <span className="report-block-title">{title}</span>
        {hint && <span className="report-block-hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function ConfigPanel({ module, config, onModuleChange, onChange }: Props) {
  const dims = dimensions(module);
  const mets = metrics(module);
  const metricField = config.metric.field === COUNT_KEY ? undefined : getField(module, config.metric.field);
  const metricAggs: Agg[] = metricField?.aggs ?? ['count'];

  return (
    <aside className="report-config">
      {/* 1 · Módulo base */}
      <Block icon={<DatabaseIcon size={15} />} title="Módulo base">
        <div className="report-module-grid">
          {MODULES.map((m) => (
            <button
              key={m.key}
              className={`report-module-btn ${m.key === module.key ? 'active' : ''}`}
              onClick={() => onModuleChange(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="report-module-desc">{module.description}</p>
      </Block>

      {/* 2 · Eixos */}
      <Block icon={<SlidersIcon size={15} />} title="Mapeamento do gráfico">
        <label className="field report-field">
          <span>Dimensão · Agrupar por (Eixo X)</span>
          <select value={config.dimension} onChange={(e) => onChange({ dimension: e.target.value })}>
            {dims.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
                {f.drillTo ? '  ↳ drill' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="field report-field">
          <span>Métrica · Valor (Eixo Y)</span>
          <select
            value={config.metric.field}
            onChange={(e) => {
              const field = e.target.value;
              const fld = getField(module, field);
              const agg: Agg = field === COUNT_KEY ? 'count' : fld?.aggs?.[0] ?? 'sum';
              onChange({ metric: { field, agg } });
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

        {metricField && metricAggs.length > 1 && (
          <div className="report-agg-toggle">
            {metricAggs.map((a) => (
              <button
                key={a}
                className={config.metric.agg === a ? 'active' : ''}
                onClick={() => onChange({ metric: { ...config.metric, agg: a } })}
              >
                {a === 'sum' ? 'Somar' : a === 'avg' ? 'Média' : 'Contar'}
              </button>
            ))}
          </div>
        )}
      </Block>

      {/* 3 · Filtros */}
      <Block icon={<FilterIcon size={15} />} title="Filtros avançados" hint={`${config.filters.length}`}>
        <FilterBuilder module={module} filters={config.filters} onChange={(filters) => onChange({ filters })} />
      </Block>

      {/* 4 · Ordenação */}
      <Block icon={<SortIcon size={15} />} title="Ordenação">
        <div className="report-sort-row">
          <select value={config.sort.by} onChange={(e) => onChange({ sort: { ...config.sort, by: e.target.value as 'label' | 'value' } })}>
            <option value="value">Pelo valor</option>
            <option value="label">Pelo rótulo</option>
          </select>
          <div className="report-agg-toggle">
            <button
              className={config.sort.dir === 'desc' ? 'active' : ''}
              onClick={() => onChange({ sort: { ...config.sort, dir: 'desc' } })}
            >
              Maior → menor
            </button>
            <button
              className={config.sort.dir === 'asc' ? 'active' : ''}
              onClick={() => onChange({ sort: { ...config.sort, dir: 'asc' } })}
            >
              Menor → maior
            </button>
          </div>
        </div>
      </Block>

      {/* 5 · Tipo de visualização */}
      <Block icon={<BarChartIcon size={15} />} title="Tipo de visualização">
        <div className="report-chart-types">
          {CHART_TYPES.map((t) => (
            <button
              key={t.key}
              className={`report-chart-type ${config.chartType === t.key ? 'active' : ''}`}
              onClick={() => onChange({ chartType: t.key })}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </Block>
    </aside>
  );
}
