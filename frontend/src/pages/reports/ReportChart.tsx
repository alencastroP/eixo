import { useId, useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from '../../theme/ThemeContext';
import {
  CATEGORICAL_DARK,
  CATEGORICAL_LIGHT,
  SERIES_END_DARK,
  SERIES_END_LIGHT,
  SERIES_PRIMARY,
  formatAxis,
  formatMetric,
  type ChartType,
  type ReportRow,
  type ValueFormat,
} from './reportEngine';

interface Props {
  chartType: Exclude<ChartType, 'table'>;
  data: ReportRow[];
  metricFormat: ValueFormat;
  metricName: string;
  canDrill: boolean;
  onDrill: (key: string) => void;
}

/** Cromo do gráfico por tema - eixos/guias em azul elétrico (diretriz da marca). */
function useChrome() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  return {
    palette: dark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT,
    seriesFrom: SERIES_PRIMARY,
    seriesTo: dark ? SERIES_END_DARK : SERIES_END_LIGHT,
    text: dark ? '#a3aab2' : '#565d64',
    grid: dark ? '#262b30' : '#e2e5e8',
    axis: dark ? '#0b84ff' : '#0b6fd6',
    tooltipBg: dark ? '#22272c' : '#ffffff',
    tooltipBorder: dark ? '#323840' : '#d3d7db',
    tooltipText: dark ? '#f5f6f7' : '#14171a',
    cursorFill: dark ? 'rgba(11,132,255,0.10)' : 'rgba(11,111,214,0.08)',
  };
}

/** Mistura dois hex (t = 0 devolve `a`, t = 1 devolve `b`). */
function mixHex(a: string, b: string, t: number) {
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const ch = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${ch(r1, r2)}${ch(g1, g2)}${ch(b1, b2)}`;
}

export function ReportChart({ chartType, data, metricFormat, metricName, canDrill, onDrill }: Props) {
  const c = useChrome();

  /* Ids únicos por instância: a visão principal e o modal de drill down convivem no
     mesmo documento, e um `url(#id)` repetido faria um herdar o degradê do outro. */
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const barGrad = `rep-bar-${uid}`;
  const lineGrad = `rep-line-${uid}`;
  const areaGrad = `rep-area-${uid}`;
  const sliceGrad = `rep-slice-${uid}`;

  const tooltip = useMemo(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function ChartTooltip(props: any) {
        const active = props?.active as boolean | undefined;
        const payload = props?.payload as Array<{ payload: ReportRow }> | undefined;
        if (!active || !payload || !payload.length) return null;
        const row = payload[0].payload;
        return (
          <div
            className="report-tooltip"
            style={{ background: c.tooltipBg, borderColor: c.tooltipBorder, color: c.tooltipText }}
          >
            <span className="report-tooltip-label">{row.label}</span>
            <span className="report-tooltip-value">{formatMetric(row.value, metricFormat)}</span>
            <span className="report-tooltip-metric">{metricName}</span>
          </div>
        );
      },
    [c.tooltipBg, c.tooltipBorder, c.tooltipText, metricFormat, metricName],
  );

  const drill = (key: unknown) => {
    if (canDrill && typeof key === 'string') onDrill(key);
  };
  const cursor = canDrill ? 'pointer' : 'default';

  if (data.length === 0) {
    return <div className="report-chart-empty">Nenhum dado para os filtros atuais.</div>;
  }

  /* ── Barras horizontais (comparar categorias) ── */
  if (chartType === 'bar') {
    const height = Math.max(300, data.length * 42 + 40);
    return (
      <div className="report-chart-scroll" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 8 }} barCategoryGap="22%">
            <defs>
              {/* Mesmo degradê da barra de participação em "Dados analíticos":
                  laranja ignição → âmbar, percorrido ao longo da própria barra. */}
              <linearGradient id={barGrad} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={c.seriesFrom} />
                <stop offset="100%" stopColor={c.seriesTo} />
              </linearGradient>
            </defs>
            <CartesianGrid horizontal={false} stroke={c.grid} strokeDasharray="3 3" />
            <XAxis
              type="number"
              tickFormatter={(v) => formatAxis(Number(v), metricFormat)}
              stroke={c.axis}
              tick={{ fill: c.text, fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={118}
              stroke={c.axis}
              tick={{ fill: c.text, fontSize: 12 }}
              tickLine={false}
              interval={0}
            />
            <Tooltip content={tooltip} cursor={{ fill: c.cursorFill }} />
            <Bar
              dataKey="value"
              radius={[0, 6, 6, 0]}
              maxBarSize={30}
              cursor={cursor}
              onClick={(entry: { key?: string }) => drill(entry?.key)}
              isAnimationActive
              animationDuration={650}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={`url(#${barGrad})`} />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                formatter={(v: number) => formatAxis(Number(v), metricFormat)}
                style={{ fill: c.text, fontSize: 11, fontWeight: 700 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  /* ── Área temporal (evolução) ── */
  if (chartType === 'line') {
    return (
      <div className="report-chart-scroll" style={{ height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 12, right: 24, bottom: 4, left: 8 }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onClick={(state: any) => drill(state?.activeLabel)}
          >
            <defs>
              {/* A linha percorre o mesmo laranja → âmbar da barra de participação. */}
              <linearGradient id={lineGrad} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={c.seriesFrom} />
                <stop offset="100%" stopColor={c.seriesTo} />
              </linearGradient>
              {/* O preenchimento repete o par, desta vez desmaiando na vertical. */}
              <linearGradient id={areaGrad} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.seriesFrom} stopOpacity={0.34} />
                <stop offset="60%" stopColor={c.seriesTo} stopOpacity={0.13} />
                <stop offset="100%" stopColor={c.seriesTo} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={c.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              stroke={c.axis}
              tick={{ fill: c.text, fontSize: 12 }}
              tickLine={false}
              interval={0}
            />
            <YAxis
              tickFormatter={(v) => formatAxis(Number(v), metricFormat)}
              stroke={c.axis}
              tick={{ fill: c.text, fontSize: 11 }}
              tickLine={false}
            />
            <Tooltip content={tooltip} cursor={{ stroke: c.axis, strokeWidth: 1, strokeDasharray: '4 4' }} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={`url(#${lineGrad})`}
              strokeWidth={2.5}
              fill={`url(#${areaGrad})`}
              cursor={cursor}
              activeDot={{ r: 6, strokeWidth: 2, fill: c.seriesFrom }}
              dot={{ r: 3, fill: c.seriesFrom, strokeWidth: 0 }}
              isAnimationActive
              animationDuration={650}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  /* ── Rosca (market share) ── */
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="report-chart-scroll" style={{ height: 380 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <defs>
            {/* Cada fatia mantém sua cor categórica, mas ganha o mesmo volume em
                degradê dos demais indicadores: clareia no topo, fecha na base. */}
            {c.palette.map((color, i) => (
              <linearGradient key={color} id={`${sliceGrad}-${i}`} x1="0" y1="0" x2="0.85" y2="1">
                <stop offset="0%" stopColor={mixHex(color, '#ffffff', 0.24)} />
                <stop offset="100%" stopColor={mixHex(color, '#000000', 0.14)} />
              </linearGradient>
            ))}
          </defs>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="52%"
            outerRadius="78%"
            paddingAngle={2}
            cursor={cursor}
            onClick={(entry: { key?: string }) => drill(entry?.key)}
            isAnimationActive
            animationDuration={650}
            stroke={c.tooltipBg}
            strokeWidth={2}
            label={(p: { percent?: number }) => (p.percent && p.percent > 0.05 ? `${Math.round(p.percent * 100)}%` : '')}
            labelLine={false}
          >
            {data.map((d, i) => (
              <Cell key={d.key} fill={`url(#${sliceGrad}-${i % c.palette.length})`} />
            ))}
          </Pie>
          <Tooltip content={tooltip} />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={9}
            /* Payload explícito: a fatia agora é pintada por `url(#...)`, que a
               bolinha de 9px não resolveria - aqui ela fica na cor chapada. */
            payload={data.map((d, i) => ({
              value: d.label,
              type: 'circle' as const,
              id: d.key,
              color: c.palette[i % c.palette.length],
            }))}
            formatter={(value: string) => {
              const row = data.find((d) => d.label === value);
              const pct = row && total ? ` · ${Math.round((row.value / total) * 100)}%` : '';
              return <span style={{ color: c.text, fontSize: 12 }}>{value}{pct}</span>;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
