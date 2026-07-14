/**
 * Motor da Trilha de Auditoria ("Caixa-Preta") — dados simulados no cliente.
 *
 * Cada entrada guarda o estado COMPLETO do registro em `before` e `after`
 * (um deles nulo em criação/exclusão) e a lista de campos que sofreram mutação
 * já calculada em `changes`. É isso que alimenta tanto a visão humana (antes vs.
 * depois) quanto o diff de JSON no modal de inspeção.
 */

import { formatBRL } from '../../utils/format';

export type Operation = 'CREATE' | 'UPDATE' | 'DELETE';
export type ValueFormat = 'text' | 'currency' | 'number' | 'km' | 'date' | 'plate';
export type JsonValue = string | number | null;
export type Record = Partial<{ [k: string]: JsonValue }>;

export interface AuditUser {
  name: string;
  role: string;
}

export interface FieldChange {
  field: string;
  label: string;
  before?: JsonValue;
  after?: JsonValue;
  format: ValueFormat;
}

export interface AuditEntry {
  id: string;
  at: string; // ISO — sempre dentro dos últimos 30 dias
  user: AuditUser;
  moduleKey: string;
  moduleLabel: string;
  entityLabel: string;
  operation: Operation;
  summary: string;
  before: Record | null;
  after: Record | null;
  changes: FieldChange[];
}

export const MODULES = [
  { key: 'inventory', label: 'Estoque' },
  { key: 'tickets', label: 'Leads/Tickets' },
  { key: 'finance', label: 'Financeiro' },
  { key: 'appraisal', label: 'Avaliação' },
] as const;

export const OPERATIONS: Array<{ key: Operation; label: string; verb: string }> = [
  { key: 'CREATE', label: 'Criação', verb: 'Criou' },
  { key: 'UPDATE', label: 'Edição', verb: 'Editou' },
  { key: 'DELETE', label: 'Exclusão', verb: 'Excluiu' },
];
export const operationLabel = (op: Operation) => OPERATIONS.find((o) => o.key === op)!.label;

const FIELD_META: { [k: string]: { label: string; format: ValueFormat } } = {
  marca: { label: 'Marca', format: 'text' },
  modelo: { label: 'Modelo', format: 'text' },
  placa: { label: 'Placa', format: 'plate' },
  anoModelo: { label: 'Ano modelo', format: 'number' },
  cor: { label: 'Cor', format: 'text' },
  km: { label: 'Quilometragem', format: 'km' },
  precoVenda: { label: 'Preço de venda', format: 'currency' },
  custo: { label: 'Custo de aquisição', format: 'currency' },
  status: { label: 'Status', format: 'text' },
  cliente: { label: 'Cliente', format: 'text' },
  telefone: { label: 'Telefone', format: 'text' },
  origem: { label: 'Origem', format: 'text' },
  prioridade: { label: 'Prioridade', format: 'text' },
  interesse: { label: 'Veículo de interesse', format: 'text' },
  responsavel: { label: 'Responsável', format: 'text' },
  descricao: { label: 'Descrição', format: 'text' },
  categoria: { label: 'Categoria', format: 'text' },
  tipo: { label: 'Tipo', format: 'text' },
  valor: { label: 'Valor', format: 'currency' },
  vencimento: { label: 'Vencimento', format: 'date' },
  veiculo: { label: 'Veículo', format: 'text' },
  valorFipe: { label: 'Valor FIPE', format: 'currency' },
  valorOfertado: { label: 'Valor ofertado', format: 'currency' },
  avaliador: { label: 'Avaliador', format: 'text' },
  laudo: { label: 'Situação do laudo', format: 'text' },
};

const meta = (field: string) => FIELD_META[field] ?? { label: field, format: 'text' as ValueFormat };

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const numFmt = new Intl.NumberFormat('pt-BR');

export function formatValue(value: JsonValue | undefined, format: ValueFormat): string {
  if (value === null || value === undefined) return '—';
  switch (format) {
    case 'currency':
      return formatBRL(Number(value)) ?? '—';
    case 'number':
      return numFmt.format(Number(value));
    case 'km':
      return `${numFmt.format(Number(value))} km`;
    case 'date':
      return dateFmt.format(new Date(String(value)));
    default:
      return String(value);
  }
}

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

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
const rng = mulberry32(2026);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
const between = (min: number, max: number) => min + rng() * (max - min);
const roundTo = (v: number, step: number) => Math.round(v / step) * step;

const USERS: AuditUser[] = [
  { name: 'Ana Prado', role: 'Vendedora' },
  { name: 'Bruno Dias', role: 'Gerente' },
  { name: 'Carla Nunes', role: 'Financeiro' },
  { name: 'Diego Rocha', role: 'Avaliador' },
  { name: 'Eduardo Lima', role: 'Administrador' },
  { name: 'Fernanda Sá', role: 'Vendedora' },
];

const MARCAS = ['Honda', 'Toyota', 'Volkswagen', 'Chevrolet', 'Jeep', 'Fiat', 'Hyundai'];
const MODELOS: { [k: string]: string[] } = {
  Honda: ['Civic', 'HR-V', 'City'],
  Toyota: ['Corolla', 'Corolla Cross', 'Hilux'],
  Volkswagen: ['Nivus', 'T-Cross', 'Polo'],
  Chevrolet: ['Onix', 'Tracker', 'S10'],
  Jeep: ['Renegade', 'Compass', 'Commander'],
  Fiat: ['Argo', 'Toro', 'Pulse'],
  Hyundai: ['HB20', 'Creta', 'Tucson'],
};
const CORES = ['Preto', 'Branco', 'Prata', 'Cinza', 'Vermelho', 'Azul'];
const INV_STATUS = ['Disponível', 'Reservado', 'Em preparação', 'Vendido'];
const TICKET_STATUS = ['Novo', 'Em atendimento', 'Aguardando cliente', 'Convertido', 'Perdido'];
const FIN_STATUS = ['Pendente', 'Pago', 'Atrasado'];
const LAUDO = ['Em análise', 'Aprovado', 'Reprovado', 'Pendente'];
const PRIORIDADE = ['Baixa', 'Normal', 'Alta', 'Urgente'];
const ORIGEM = ['OLX', 'Mercado Livre', 'Webmotors', 'Instagram', 'Indicação'];
const CATEGORIAS = ['Comissão', 'Preparação', 'Marketing', 'Aluguel', 'Impostos'];
const CLIENTES = ['João Silva', 'Maria Souza', 'Pedro Alves', 'Luiza Costa', 'Marcos Reis', 'Beatriz Lima'];

function randomPlate(): string {
  const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const l = () => L[Math.floor(rng() * L.length)];
  const d = () => Math.floor(rng() * 10);
  return `${l()}${l()}${l()}${d()}${l()}${d()}${d()}`;
}

interface Built {
  record: Record;
  entityLabel: string;
  pools: { [k: string]: readonly (string | number)[] };
}

function buildInventory(): Built {
  const marca = pick(MARCAS);
  const modelo = pick(MODELOS[marca]);
  const placa = randomPlate();
  const preco = roundTo(between(55000, 260000), 500);
  return {
    record: {
      marca,
      modelo,
      placa,
      anoModelo: pick([2021, 2022, 2023, 2024, 2025, 2026]),
      cor: pick(CORES),
      km: roundTo(between(0, 120000), 1000),
      precoVenda: preco,
      custo: roundTo(preco * between(0.8, 0.92), 500),
      status: pick(INV_STATUS),
    },
    entityLabel: `Estoque: ${marca} ${modelo} - ${placa}`,
    pools: { cor: CORES, status: INV_STATUS, anoModelo: [2021, 2022, 2023, 2024, 2025, 2026] },
  };
}

function buildTicket(n: number): Built {
  const cliente = pick(CLIENTES);
  const marca = pick(MARCAS);
  return {
    record: {
      cliente,
      telefone: `(11) 9${Math.floor(between(4000, 9999))}-${Math.floor(between(1000, 9999))}`,
      origem: pick(ORIGEM),
      status: pick(TICKET_STATUS),
      prioridade: pick(PRIORIDADE),
      interesse: `${marca} ${pick(MODELOS[marca])}`,
      responsavel: pick(USERS).name,
    },
    entityLabel: `Ticket #${1000 + n} - ${cliente}`,
    pools: { origem: ORIGEM, status: TICKET_STATUS, prioridade: PRIORIDADE, responsavel: USERS.map((u) => u.name) },
  };
}

function buildFinance(n: number): Built {
  const categoria = pick(CATEGORIAS);
  const tipo = categoria === 'Comissão' ? 'Receita' : 'Despesa';
  return {
    record: {
      descricao: `${categoria} - Venda #${80 + (n % 40)}`,
      categoria,
      tipo,
      valor: roundTo(between(800, 45000), 50),
      vencimento: `2026-0${1 + Math.floor(rng() * 7)}-${String(1 + Math.floor(rng() * 27)).padStart(2, '0')}`,
      status: pick(FIN_STATUS),
    },
    entityLabel: `Financeiro: ${categoria} - Venda #${80 + (n % 40)}`,
    pools: { categoria: CATEGORIAS, tipo: ['Receita', 'Despesa'], status: FIN_STATUS },
  };
}

function buildAppraisal(): Built {
  const marca = pick(MARCAS);
  const modelo = pick(MODELOS[marca]);
  const placa = randomPlate();
  const fipe = roundTo(between(45000, 220000), 500);
  return {
    record: {
      veiculo: `${marca} ${modelo}`,
      placa,
      valorFipe: fipe,
      valorOfertado: roundTo(fipe * between(0.82, 0.95), 500),
      avaliador: pick(USERS).name,
      laudo: pick(LAUDO),
    },
    entityLabel: `Avaliação: ${marca} ${modelo} - ${placa}`,
    pools: { laudo: LAUDO, avaliador: USERS.map((u) => u.name) },
  };
}

function build(moduleKey: string, n: number): Built {
  if (moduleKey === 'inventory') return buildInventory();
  if (moduleKey === 'tickets') return buildTicket(n);
  if (moduleKey === 'finance') return buildFinance(n);
  return buildAppraisal();
}

/** Gera um valor "antigo" plausível e diferente do atual para um campo em edição. */
function oldValueFor(field: string, current: JsonValue, pools: Built['pools']): JsonValue {
  const pool = pools[field];
  if (pool) {
    const options = pool.filter((v) => v !== current);
    return (options.length ? pick(options) : current) as JsonValue;
  }
  const { format } = meta(field);
  if (format === 'currency') return roundTo(Number(current) * between(1.03, 1.18), 500);
  if (format === 'km') return roundTo(Number(current) * between(0.8, 0.98), 1000);
  if (format === 'number') return Number(current) - 1;
  return `${current} (rev.)`;
}

const CREATE_NOUN: { [k: string]: string } = {
  inventory: 'um veículo no estoque',
  tickets: 'um novo ticket',
  finance: 'um lançamento financeiro',
  appraisal: 'uma avaliação',
};

function buildSummary(op: Operation, moduleKey: string, changes: FieldChange[]): string {
  if (op === 'CREATE') return `Criou ${CREATE_NOUN[moduleKey]}`;
  if (op === 'DELETE') return `Excluiu ${CREATE_NOUN[moduleKey]}`;
  const c = changes[0];
  const base = `Alterou ${c.label} de ${formatValue(c.before, c.format)} para ${formatValue(c.after, c.format)}`;
  return changes.length > 1 ? `${base} +${changes.length - 1} outro${changes.length > 2 ? 's' : ''}` : base;
}

function generate(): AuditEntry[] {
  const now = Date.now();
  const DAY = 86_400_000;
  const entries: AuditEntry[] = [];
  for (let i = 0; i < 150; i++) {
    const moduleKey = pick(MODULES).key;
    const moduleLabel = MODULES.find((m) => m.key === moduleKey)!.label;
    const { record, entityLabel, pools } = build(moduleKey, i);
    const op: Operation = ((): Operation => {
      const r = rng();
      return r < 0.6 ? 'UPDATE' : r < 0.82 ? 'CREATE' : 'DELETE';
    })();

    let before: Record | null = null;
    let after: Record | null = null;
    const changes: FieldChange[] = [];

    if (op === 'CREATE') {
      after = record;
      for (const field of Object.keys(record)) {
        const { label, format } = meta(field);
        changes.push({ field, label, after: record[field], format });
      }
    } else if (op === 'DELETE') {
      before = record;
      for (const field of Object.keys(record)) {
        const { label, format } = meta(field);
        changes.push({ field, label, before: record[field], format });
      }
    } else {
      after = record;
      before = { ...record };
      const fields = Object.keys(record).filter((f) => f !== 'placa' && f !== 'telefone');
      const count = 1 + Math.floor(rng() * 2);
      const chosen = new Set<string>();
      while (chosen.size < count) chosen.add(pick(fields));
      for (const field of chosen) {
        const oldVal = oldValueFor(field, record[field]!, pools);
        before[field] = oldVal;
        const { label, format } = meta(field);
        changes.push({ field, label, before: oldVal, after: record[field], format });
      }
    }

    entries.push({
      id: `log_${i}_${Math.random().toString(36).slice(2, 7)}`,
      at: new Date(now - roundTo(between(0, 30 * DAY), 60_000)).toISOString(),
      user: pick(USERS),
      moduleKey,
      moduleLabel,
      entityLabel,
      operation: op,
      summary: buildSummary(op, moduleKey, changes),
      before,
      after,
      changes,
    });
  }
  return entries.sort((a, b) => b.at.localeCompare(a.at));
}

export const AUDIT_LOG: AuditEntry[] = generate();

/* ─────────────────────────── Filtros ───────────────────────────── */

export type Period = '1' | '7' | '30';

export interface AuditFilters {
  user: string;
  moduleKey: string;
  operation: '' | Operation;
  period: Period;
}

export const DEFAULT_FILTERS: AuditFilters = { user: '', moduleKey: '', operation: '', period: '30' };

export function filterLog(log: AuditEntry[], f: AuditFilters): AuditEntry[] {
  const now = Date.now();
  const cutoff = now - Number(f.period) * 86_400_000;
  const term = f.user.trim().toLowerCase();
  return log.filter((e) => {
    if (new Date(e.at).getTime() < cutoff) return false;
    if (f.moduleKey && e.moduleKey !== f.moduleKey) return false;
    if (f.operation && e.operation !== f.operation) return false;
    if (term && !e.user.name.toLowerCase().includes(term)) return false;
    return true;
  });
}

/** Chaves presentes em before e/ou after (união), preservando ordem do objeto atual. */
export function jsonKeys(entry: AuditEntry): string[] {
  const src = entry.after ?? entry.before ?? {};
  return Object.keys(src);
}

/** Conjunto de campos que mudaram — para destacar no diff de JSON. */
export function changedFields(entry: AuditEntry): Set<string> {
  return new Set(entry.changes.map((c) => c.field));
}
