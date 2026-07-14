import { FinancialStatus, FinancialType, Prisma } from '@prisma/client';
import { badRequest, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';

const dec = (d: Prisma.Decimal): number => Number(d);

const include = {
  vehicle: { select: { id: true, brand: true, model: true, plate: true } },
} satisfies Prisma.FinancialEntryInclude;

type Row = Prisma.FinancialEntryGetPayload<{ include: typeof include }>;

/** Status efetivo: PENDING vencido vira OVERDUE (derivado, não persistido). */
export type EffectiveStatus = 'PENDING' | 'PAID' | 'OVERDUE';

function effectiveStatus(row: { status: FinancialStatus; dueDate: Date }): EffectiveStatus {
  if (row.status === FinancialStatus.PAID) return 'PAID';
  return row.dueDate < new Date() ? 'OVERDUE' : 'PENDING';
}

function serialize(row: Row) {
  return {
    id: row.id,
    type: row.type,
    status: effectiveStatus(row),
    category: row.category,
    description: row.description,
    amount: dec(row.amount),
    dueDate: row.dueDate,
    paidAt: row.paidAt,
    vehicle: row.vehicle,
    createdAt: row.createdAt,
  };
}

export interface ListParams {
  type?: FinancialType;
  status?: EffectiveStatus;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function listEntries(params: ListParams) {
  const and: Prisma.FinancialEntryWhereInput[] = [];
  if (params.type) and.push({ type: params.type });
  if (params.category) and.push({ category: params.category });
  if (params.dateFrom) and.push({ dueDate: { gte: new Date(`${params.dateFrom}T00:00:00`) } });
  if (params.dateTo) and.push({ dueDate: { lte: new Date(`${params.dateTo}T23:59:59.999`) } });

  // status efetivo em SQL: OVERDUE = PENDING + vencido
  if (params.status === 'PAID') and.push({ status: FinancialStatus.PAID });
  else if (params.status === 'PENDING') and.push({ status: FinancialStatus.PENDING, dueDate: { gte: new Date() } });
  else if (params.status === 'OVERDUE') and.push({ status: FinancialStatus.PENDING, dueDate: { lt: new Date() } });

  const rows = await prisma.financialEntry.findMany({
    where: { AND: and },
    include,
    orderBy: { dueDate: 'asc' },
  });
  return rows.map(serialize);
}

/** KPIs do topo: saldo em caixa, a receber e a pagar no mês corrente. */
export async function summary() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [paidReceived, paidPaid, receivableMonth, payableMonth, overdue] = await Promise.all([
    prisma.financialEntry.aggregate({ _sum: { amount: true }, where: { type: 'RECEIVABLE', status: 'PAID' } }),
    prisma.financialEntry.aggregate({ _sum: { amount: true }, where: { type: 'PAYABLE', status: 'PAID' } }),
    prisma.financialEntry.aggregate({
      _sum: { amount: true },
      where: { type: 'RECEIVABLE', dueDate: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.financialEntry.aggregate({
      _sum: { amount: true },
      where: { type: 'PAYABLE', dueDate: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.financialEntry.count({ where: { status: 'PENDING', dueDate: { lt: now } } }),
  ]);

  const num = (a: { _sum: { amount: Prisma.Decimal | null } }) => Number(a._sum.amount ?? 0);
  // saldo em caixa = tudo que efetivamente entrou − tudo que efetivamente saiu
  const balance = num(paidReceived) - num(paidPaid);

  return {
    balance,
    receivableMonth: num(receivableMonth),
    payableMonth: num(payableMonth),
    projectedMonth: num(receivableMonth) - num(payableMonth),
    overdueCount: overdue,
  };
}

export interface CreateEntryInput {
  type: FinancialType;
  category: string;
  description: string;
  amount: number;
  dueDate: string;
  vehicleId?: string | null;
  paid?: boolean;
}

export async function createEntry(input: CreateEntryInput) {
  if (input.vehicleId) {
    const v = await prisma.vehicle.findUnique({ where: { id: input.vehicleId }, select: { id: true } });
    if (!v) throw badRequest('Veículo vinculado inválido');
  }
  const row = await prisma.financialEntry.create({
    data: {
      type: input.type,
      category: input.category.trim(),
      description: input.description.trim(),
      amount: new Prisma.Decimal(input.amount),
      dueDate: new Date(input.dueDate),
      vehicleId: input.vehicleId ?? null,
      status: input.paid ? FinancialStatus.PAID : FinancialStatus.PENDING,
      paidAt: input.paid ? new Date() : null,
    },
    include,
  });
  return serialize(row);
}

/** Alterna pago/pendente (quita ou reabre um lançamento). */
export async function setPaid(id: string, paid: boolean) {
  const existing = await prisma.financialEntry.findUnique({ where: { id } });
  if (!existing) throw notFound('Lançamento não encontrado');
  const row = await prisma.financialEntry.update({
    where: { id },
    data: {
      status: paid ? FinancialStatus.PAID : FinancialStatus.PENDING,
      paidAt: paid ? (existing.paidAt ?? new Date()) : null,
    },
    include,
  });
  return serialize(row);
}

export async function deleteEntry(id: string) {
  const existing = await prisma.financialEntry.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw notFound('Lançamento não encontrado');
  await prisma.financialEntry.delete({ where: { id } });
}
