/**
 * Motor de relatórios (BI) — 100% no cliente, dados simulados.
 *
 * Um "schema" descreve cada módulo base (Vendas, Estoque, …) com seus campos
 * (dimensões e métricas). Sobre esse schema roda um agregador genérico que
 * agrupa, filtra, ordena e — o ponto central — permite Drill Down: ao clicar
 * numa fatia/barra, empilhamos um filtro e trocamos a dimensão de agrupamento
 * pela dimensão "filha" (drillTo), recalculando os números de verdade.
 */

export type ChartType = 'bar' | 'line' | 'pie' | 'table';
export type Agg = 'sum' | 'avg' | 'count';
export type FieldType = 'text' | 'number';
export type ValueFormat = 'number' | 'currency' | 'days' | 'year';
export type Op = 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains';

export const COUNT_KEY = '__count__';

export interface Field {
  key: string;
  label: string;
  role: 'dimension' | 'metric';
  type: FieldType;
  /** Dimensão-filha revelada no drill down (ex.: estado → cidade). */
  drillTo?: string;
  /** Ordem natural (meses, faixas etárias) — usada na ordenação por rótulo. */
  ordered?: string[];
  /** Métrica: agregações permitidas e formatação do valor. */
  aggs?: Agg[];
  format?: ValueFormat;
}

export interface ModuleSchema {
  key: string;
  label: string;
  description: string;
  fields: Field[];
  rows: Row[];
}

export type Row = Record<string, string | number>;

export interface FilterCond {
  id: string;
  field: string;
  op: Op;
  value: string;
}

export interface MetricConfig {
  /** COUNT_KEY = contagem de registros; senão a chave de um campo numérico. */
  field: string;
  agg: Agg;
}

export interface SortConfig {
  by: 'label' | 'value';
  dir: 'asc' | 'desc';
}

/** Um nível já "descido" no drill down. */
export interface DrillStep {
  field: string;
  fieldLabel: string;
  value: string;
}

export interface ReportRow {
  key: string;
  label: string;
  value: number;
}

/** Estado completo do relatório configurado pelo usuário. */
export interface ReportConfig {
  moduleKey: string;
  dimension: string;
  metric: MetricConfig;
  filters: FilterCond[];
  sort: SortConfig;
  chartType: ChartType;
}

/** Relatório nomeado criado pelo usuário (mantido na sessão). */
export interface SavedReport {
  id: string;
  name: string;
  config: ReportConfig;
}

/** Configuração inicial coerente ao selecionar um módulo. */
export function defaultConfig(moduleKey: string): ReportConfig {
  const mod = getModule(moduleKey);
  const firstDim = mod.fields.find((f) => f.role === 'dimension')!;
  return {
    moduleKey,
    dimension: firstDim.key,
    metric: { field: COUNT_KEY, agg: 'count' },
    filters: [],
    sort: { by: 'value', dir: 'desc' },
    chartType: 'bar',
  };
}

/* ─────────────────────────── Paletas (validadas via skill dataviz) ─────────── */

/** Categóricas para pizza/multi-série — passam nos 6 checks do validador. */
export const CATEGORICAL_DARK = ['#E05F2A', '#0B84FF', '#1FA35C', '#9B6DFF', '#C0850C', '#E5484D'];
export const CATEGORICAL_LIGHT = ['#E0551F', '#0B6FD6', '#1F9D57', '#7C5CE0', '#B7791F', '#CF3339'];

/** Série única (barras/linha) — laranja ignição da marca. */
export const SERIES_PRIMARY = '#FF6B35';

/* ─────────────────────────── Gerador determinístico ────────────────────────── */

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];
const between = (r: () => number, min: number, max: number) => min + r() * (max - min);
/** Escolha ponderada: [[valor, peso], …]. */
function weighted<T>(r: () => number, pairs: readonly [T, number][]): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of pairs) {
    if ((x -= w) <= 0) return v;
  }
  return pairs[pairs.length - 1][0];
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago'];
const FAIXAS_ETARIAS = ['18–25', '26–35', '36–50', '51+'];
const FAIXAS_PRECO = ['Até 60k', '60–100k', '100–160k', '160–250k', '250k+'];

const ESTADOS: Record<string, string[]> = {
  SP: ['São Paulo', 'Campinas', 'Ribeirão Preto', 'Santos'],
  MG: ['Belo Horizonte', 'Uberlândia', 'Contagem'],
  RJ: ['Rio de Janeiro', 'Niterói', 'Nova Iguaçu'],
  PR: ['Curitiba', 'Londrina', 'Maringá'],
  RS: ['Porto Alegre', 'Caxias do Sul'],
  SC: ['Florianópolis', 'Joinville', 'Blumenau'],
  BA: ['Salvador', 'Feira de Santana'],
  GO: ['Goiânia', 'Anápolis'],
};
const ESTADO_KEYS = Object.keys(ESTADOS);

const MARCAS: Record<string, string[]> = {
  Volkswagen: ['Gol', 'Polo', 'T-Cross', 'Nivus', 'Virtus'],
  Chevrolet: ['Onix', 'Tracker', 'Spin', 'S10'],
  Fiat: ['Argo', 'Toro', 'Strada', 'Pulse'],
  Toyota: ['Corolla', 'Corolla Cross', 'Hilux', 'Yaris'],
  Hyundai: ['HB20', 'Creta', 'Tucson'],
  Jeep: ['Renegade', 'Compass', 'Commander'],
  Honda: ['Civic', 'HR-V', 'City'],
  Renault: ['Kwid', 'Duster', 'Oroch'],
};
const MARCA_KEYS = Object.keys(MARCAS);

const CATEGORIAS = ['Hatch', 'Sedã', 'SUV', 'Picape'] as const;
const PRECO_BASE: Record<(typeof CATEGORIAS)[number], [number, number]> = {
  Hatch: [55000, 95000],
  Sedã: [90000, 165000],
  SUV: [110000, 260000],
  Picape: [140000, 320000],
};
const VENDEDORES = ['Ana Prado', 'Bruno Dias', 'Carla Nunes', 'Diego Rocha', 'Eduardo Lima', 'Fernanda Sá'];
const PAGAMENTOS: [string, number][] = [
  ['Financiamento', 46],
  ['À vista', 24],
  ['Troca + volta', 18],
  ['Consórcio', 12],
];
const FUEL: [string, number][] = [
  ['Flex', 62],
  ['Diesel', 20],
  ['Híbrido', 12],
  ['Elétrico', 6],
];

function precoFaixa(v: number): string {
  if (v < 60000) return FAIXAS_PRECO[0];
  if (v < 100000) return FAIXAS_PRECO[1];
  if (v < 160000) return FAIXAS_PRECO[2];
  if (v < 250000) return FAIXAS_PRECO[3];
  return FAIXAS_PRECO[4];
}

function buildVendas(): Row[] {
  const r = mulberry32(101);
  const rows: Row[] = [];
  for (let i = 0; i < 520; i++) {
    const estado = weighted(r, [
      ['SP', 32],
      ['MG', 16],
      ['RJ', 14],
      ['PR', 11],
      ['RS', 9],
      ['SC', 8],
      ['BA', 6],
      ['GO', 4],
    ]);
    const cidade = pick(r, ESTADOS[estado]);
    const marca = pick(r, MARCA_KEYS);
    const modelo = pick(r, MARCAS[marca]);
    const categoria = pick(r, CATEGORIAS);
    const [pmin, pmax] = PRECO_BASE[categoria];
    const valor = Math.round(between(r, pmin, pmax) / 500) * 500;
    const margem = Math.round(valor * between(r, 0.06, 0.15));
    // tendência de crescimento ao longo de 2026
    const mes = weighted(
      r,
      MESES.slice(0, 8).map((m, idx) => [m, 6 + idx * 2] as [string, number]),
    );
    rows.push({
      estado,
      cidade,
      marca,
      modelo,
      categoria,
      vendedor: pick(r, VENDEDORES),
      pagamento: weighted(r, PAGAMENTOS),
      mes,
      valor,
      margem,
      diasVenda: Math.round(between(r, 2, 110)),
    });
  }
  return rows;
}

function buildEstoque(): Row[] {
  const r = mulberry32(202);
  const rows: Row[] = [];
  for (let i = 0; i < 240; i++) {
    const marca = pick(r, MARCA_KEYS);
    const modelo = pick(r, MARCAS[marca]);
    const categoria = pick(r, CATEGORIAS);
    const [pmin, pmax] = PRECO_BASE[categoria];
    const precoVenda = Math.round(between(r, pmin, pmax) / 500) * 500;
    const custo = Math.round(precoVenda * between(r, 0.78, 0.93));
    rows.push({
      marca,
      modelo,
      categoria,
      status: weighted(r, [
        ['Disponível', 54],
        ['Reservado', 16],
        ['Em preparação', 18],
        ['Vendido', 12],
      ]),
      combustivel: weighted(r, FUEL),
      anoModelo: weighted(r, [
        [2026, 22],
        [2025, 26],
        [2024, 20],
        [2023, 14],
        [2022, 10],
        [2021, 8],
      ]),
      faixaPreco: precoFaixa(precoVenda),
      precoVenda,
      custo,
      diasPatio: Math.round(between(r, 1, 160)),
    });
  }
  return rows;
}

function buildClientes(): Row[] {
  const r = mulberry32(303);
  const rows: Row[] = [];
  const cidadesFlat = ESTADO_KEYS.flatMap((e) => ESTADOS[e]);
  for (let i = 0; i < 300; i++) {
    rows.push({
      cidade: pick(r, cidadesFlat),
      origem: weighted(r, [
        ['OLX', 26],
        ['Mercado Livre', 18],
        ['Webmotors', 16],
        ['Instagram', 14],
        ['Indicação', 14],
        ['Loja física', 12],
      ]),
      faixaEtaria: pick(r, FAIXAS_ETARIAS),
      status: weighted(r, [
        ['Ativo', 40],
        ['Lead', 42],
        ['Inativo', 18],
      ]),
      ticketMedio: Math.round(between(r, 45000, 210000) / 1000) * 1000,
    });
  }
  return rows;
}

function buildFinanceiro(): Row[] {
  const r = mulberry32(404);
  const rows: Row[] = [];
  const cats: [string, 'Receita' | 'Despesa'][] = [
    ['Venda de veículos', 'Receita'],
    ['Comissão de intermediação', 'Receita'],
    ['Serviços / oficina', 'Receita'],
    ['Salários', 'Despesa'],
    ['Marketing', 'Despesa'],
    ['Preparação de estoque', 'Despesa'],
    ['Aluguel', 'Despesa'],
    ['Impostos', 'Despesa'],
  ];
  for (let i = 0; i < 260; i++) {
    const [categoria, tipo] = pick(r, cats);
    const base = tipo === 'Receita' ? between(r, 8000, 180000) : between(r, 1500, 60000);
    rows.push({
      categoria,
      tipo,
      status: weighted(r, [
        ['Pago', 58],
        ['Pendente', 30],
        ['Atrasado', 12],
      ]),
      mes: pick(r, MESES.slice(0, 8)),
      valor: Math.round(base / 100) * 100,
    });
  }
  return rows;
}

/* ─────────────────────────── Schemas dos módulos ───────────────────────────── */

const dim = (key: string, label: string, extra: Partial<Field> = {}): Field => ({
  key,
  label,
  role: 'dimension',
  type: 'text',
  ...extra,
});
const metric = (key: string, label: string, aggs: Agg[], format: ValueFormat): Field => ({
  key,
  label,
  role: 'metric',
  type: 'number',
  aggs,
  format,
});

export const MODULES: ModuleSchema[] = [
  {
    key: 'vendas',
    label: 'Vendas',
    description: 'Faturamento, margem e volume de vendas fechadas.',
    fields: [
      dim('estado', 'Estado (UF)', { drillTo: 'cidade' }),
      dim('cidade', 'Cidade'),
      dim('categoria', 'Categoria', { drillTo: 'marca' }),
      dim('marca', 'Marca', { drillTo: 'modelo' }),
      dim('modelo', 'Modelo'),
      dim('vendedor', 'Vendedor'),
      dim('pagamento', 'Forma de pagamento'),
      dim('mes', 'Mês (2026)', { ordered: MESES }),
      metric('valor', 'Faturamento', ['sum', 'avg'], 'currency'),
      metric('margem', 'Margem bruta', ['sum', 'avg'], 'currency'),
      metric('diasVenda', 'Tempo até a venda', ['avg'], 'days'),
    ],
    rows: buildVendas(),
  },
  {
    key: 'estoque',
    label: 'Estoque',
    description: 'Veículos em pátio, custo real e tempo de giro.',
    fields: [
      dim('categoria', 'Categoria', { drillTo: 'marca' }),
      dim('marca', 'Marca', { drillTo: 'modelo' }),
      dim('modelo', 'Modelo'),
      dim('status', 'Status'),
      dim('combustivel', 'Combustível'),
      dim('faixaPreco', 'Faixa de preço', { ordered: FAIXAS_PRECO }),
      dim('anoModelo', 'Ano modelo', { type: 'number' }),
      metric('precoVenda', 'Preço de venda', ['sum', 'avg'], 'currency'),
      metric('custo', 'Custo de aquisição', ['sum', 'avg'], 'currency'),
      metric('diasPatio', 'Tempo de pátio', ['avg'], 'days'),
    ],
    rows: buildEstoque(),
  },
  {
    key: 'clientes',
    label: 'Clientes',
    description: 'Base de clientes por origem, cidade e perfil.',
    fields: [
      dim('origem', 'Origem do lead'),
      dim('cidade', 'Cidade'),
      dim('faixaEtaria', 'Faixa etária', { ordered: FAIXAS_ETARIAS }),
      dim('status', 'Status'),
      metric('ticketMedio', 'Ticket médio', ['avg', 'sum'], 'currency'),
    ],
    rows: buildClientes(),
  },
  {
    key: 'financeiro',
    label: 'Financeiro',
    description: 'Receitas e despesas por categoria e competência.',
    fields: [
      dim('categoria', 'Categoria'),
      dim('tipo', 'Tipo', { drillTo: 'categoria' }),
      dim('status', 'Status'),
      dim('mes', 'Mês (2026)', { ordered: MESES }),
      metric('valor', 'Valor', ['sum', 'avg'], 'currency'),
    ],
    rows: buildFinanceiro(),
  },
];

/* ─────────────────────────── Consultas de schema ───────────────────────────── */

export const getModule = (key: string): ModuleSchema =>
  MODULES.find((m) => m.key === key) ?? MODULES[0];
export const getField = (mod: ModuleSchema, key: string): Field | undefined =>
  mod.fields.find((f) => f.key === key);
export const dimensions = (mod: ModuleSchema): Field[] => mod.fields.filter((f) => f.role === 'dimension');
export const metrics = (mod: ModuleSchema): Field[] => mod.fields.filter((f) => f.role === 'metric');

/** Valores distintos de uma dimensão (para preencher selects de filtro). */
export function distinctValues(mod: ModuleSchema, fieldKey: string): string[] {
  const field = getField(mod, fieldKey);
  const set = new Set<string>();
  for (const row of mod.rows) set.add(String(row[fieldKey]));
  const arr = [...set];
  if (field?.ordered) return arr.sort((a, b) => field.ordered!.indexOf(a) - field.ordered!.indexOf(b));
  if (field?.type === 'number') return arr.sort((a, b) => Number(a) - Number(b));
  return arr.sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Dimensão de agrupamento efetiva no nível atual do drill down. */
export function effectiveDimension(mod: ModuleSchema, baseDim: string, drill: DrillStep[]): string {
  if (drill.length === 0) return baseDim;
  const last = drill[drill.length - 1];
  return getField(mod, last.field)?.drillTo ?? last.field;
}

/* ─────────────────────────── Filtros e agregação ───────────────────────────── */

function matchOp(cell: string | number, op: Op, raw: string, numeric: boolean): boolean {
  if (numeric) {
    const a = Number(cell);
    const b = Number(raw);
    if (Number.isNaN(b)) return true; // filtro incompleto: ignora
    switch (op) {
      case 'eq': return a === b;
      case 'ne': return a !== b;
      case 'gt': return a > b;
      case 'lt': return a < b;
      case 'gte': return a >= b;
      case 'lte': return a <= b;
      default: return true;
    }
  }
  const a = String(cell).toLowerCase();
  const b = raw.trim().toLowerCase();
  if (b === '') return true;
  switch (op) {
    case 'eq': return a === b;
    case 'ne': return a !== b;
    case 'contains': return a.includes(b);
    default: return true;
  }
}

function aggregate(rows: Row[], metricCfg: MetricConfig): number {
  if (metricCfg.field === COUNT_KEY || metricCfg.agg === 'count') return rows.length;
  let sum = 0;
  for (const row of rows) sum += Number(row[metricCfg.field]) || 0;
  if (metricCfg.agg === 'avg') return rows.length ? sum / rows.length : 0;
  return sum;
}

/** Executa o relatório do nível atual: filtra → drill → agrupa → agrega → ordena. */
export function computeReport(
  mod: ModuleSchema,
  dimensionKey: string,
  metricCfg: MetricConfig,
  filters: FilterCond[],
  drill: DrillStep[],
  sort: SortConfig,
): ReportRow[] {
  let rows = mod.rows;

  for (const f of filters) {
    const field = getField(mod, f.field);
    if (!field) continue;
    rows = rows.filter((row) => matchOp(row[f.field], f.op, f.value, field.type === 'number'));
  }
  for (const step of drill) rows = rows.filter((row) => String(row[step.field]) === step.value);

  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const k = String(row[dimensionKey] ?? '—');
    const bucket = groups.get(k);
    if (bucket) bucket.push(row);
    else groups.set(k, [row]);
  }

  const out: ReportRow[] = [];
  for (const [k, rs] of groups) out.push({ key: k, label: k, value: aggregate(rs, metricCfg) });

  const dimField = getField(mod, dimensionKey);
  const factor = sort.dir === 'asc' ? 1 : -1;
  out.sort((a, b) => {
    if (sort.by === 'value') return (a.value - b.value) * factor;
    if (dimField?.ordered) {
      return (dimField.ordered.indexOf(a.label) - dimField.ordered.indexOf(b.label)) * factor;
    }
    if (dimField?.type === 'number') return (Number(a.label) - Number(b.label)) * factor;
    return a.label.localeCompare(b.label, 'pt-BR') * factor;
  });
  return out;
}

/* ─────────────────────────── Formatação e export ───────────────────────────── */

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export function formatMetric(value: number, format: ValueFormat | undefined): string {
  switch (format) {
    case 'currency': return brl.format(value);
    case 'days': return `${num.format(Math.round(value))} dias`;
    case 'year': return String(Math.round(value));
    default: return num.format(Math.round(value));
  }
}

/** Compacto para eixos (R$ 1,2 mi / R$ 320 mil). */
export function formatAxis(value: number, format: ValueFormat | undefined): string {
  if (format === 'currency') {
    if (Math.abs(value) >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace('.', ',')} mi`;
    if (Math.abs(value) >= 1000) return `R$ ${Math.round(value / 1000)} mil`;
    return brl.format(value);
  }
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1).replace('.', ',')} mil`;
  return num.format(Math.round(value));
}

export function metricLabel(field: Field | undefined, agg: Agg): string {
  if (!field) return 'Registros';
  const prefix = agg === 'avg' ? 'Média de ' : agg === 'count' ? '' : 'Total de ';
  return field.role === 'metric' ? `${prefix}${field.label.toLowerCase()}` : field.label;
}

export function toCsv(rows: ReportRow[], dimensionLabel: string, valueHeader: string): string {
  const esc = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [`${esc(dimensionLabel)};${esc(valueHeader)}`];
  for (const r of rows) lines.push(`${esc(r.label)};${r.value}`);
  return lines.join('\r\n');
}
