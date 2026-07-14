import { randomInt } from 'node:crypto';
import { FiscalKind, FiscalStatus, Prisma } from '@prisma/client';
import { badRequest, notFound } from '../../lib/errors';
import { onlyDigits } from '../../lib/document';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';

const dec = (d: Prisma.Decimal): number => Number(d);

/**
 * Alíquotas e regras de base de cálculo (mock — simplificado para demonstração).
 * Ponto central: para veículo USADO, o ICMS incide sobre a MARGEM de lucro
 * (venda − compra), não sobre o valor total. Notas de entrada de PF e devolução
 * de consignado não têm incidência de ICMS.
 */
const ICMS_MARGIN_RATE = 0.12; // ICMS sobre a margem (saída)
const ISS_RATE = 0.05; // ISS sobre serviços (NFS-e)

export interface TaxComputation {
  operationValue: number;
  taxBase: number;
  taxRate: number;
  taxAmount: number;
  taxLabel: string;
}

export function computeTax(
  kind: FiscalKind,
  input: { operationValue: number; costPrice?: number | null },
): TaxComputation {
  const value = Math.max(0, input.operationValue);
  switch (kind) {
    case FiscalKind.NFE_EXIT: {
      // usados: base = margem (venda − compra), nunca negativa
      const margin = Math.max(0, value - (input.costPrice ?? 0));
      return {
        operationValue: value,
        taxBase: margin,
        taxRate: ICMS_MARGIN_RATE,
        taxAmount: Math.round(margin * ICMS_MARGIN_RATE * 100) / 100,
        taxLabel: 'ICMS sobre a margem (venda − compra)',
      };
    }
    case FiscalKind.NFSE:
      return {
        operationValue: value,
        taxBase: value,
        taxRate: ISS_RATE,
        taxAmount: Math.round(value * ISS_RATE * 100) / 100,
        taxLabel: 'ISS sobre o valor do serviço',
      };
    case FiscalKind.NFE_ENTRY:
      return {
        operationValue: value,
        taxBase: 0,
        taxRate: 0,
        taxAmount: 0,
        taxLabel: 'Entrada de Pessoa Física — sem incidência de ICMS',
      };
    case FiscalKind.NFE_RETURN:
      return {
        operationValue: value,
        taxBase: 0,
        taxRate: 0,
        taxAmount: 0,
        taxLabel: 'Devolução de consignado — sem incidência de ICMS',
      };
  }
}

/** Chave de acesso mock (44 dígitos), no formato de uma NF-e real. */
function generateAccessKey(): string {
  let key = '';
  for (let i = 0; i < 44; i++) key += randomInt(0, 10).toString();
  return key;
}

const include = {
  vehicle: { select: { id: true, brand: true, model: true, plate: true } },
} satisfies Prisma.FiscalInvoiceInclude;

type Row = Prisma.FiscalInvoiceGetPayload<{ include: typeof include }>;

function serialize(row: Row) {
  return {
    id: row.id,
    number: row.number,
    kind: row.kind,
    status: row.status,
    accessKey: row.accessKey,
    recipientName: row.recipientName,
    recipientDoc: row.recipientDoc,
    operationValue: dec(row.operationValue),
    taxBase: dec(row.taxBase),
    taxRate: dec(row.taxRate),
    taxAmount: dec(row.taxAmount),
    taxLabel: row.taxLabel,
    vehicle: row.vehicle,
    rejectReason: row.rejectReason,
    issuedAt: row.issuedAt,
    xml: row.xml,
  };
}

export async function listInvoices(kind?: FiscalKind) {
  const rows = await prisma.fiscalInvoice.findMany({
    where: kind ? { kind } : {},
    include,
    orderBy: { issuedAt: 'desc' },
    take: 100,
  });
  return rows.map(serialize);
}

export async function getInvoice(id: string) {
  const row = await prisma.fiscalInvoice.findUnique({ where: { id }, include });
  if (!row) throw notFound('Nota não encontrada');
  return serialize(row);
}

export interface EmitInput {
  kind: FiscalKind;
  vehicleId?: string | null;
  recipientName: string;
  recipientDoc?: string | null;
  operationValue: number;
}

function buildXml(number: number, accessKey: string, tax: TaxComputation, recipient: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<nfeProc versao="4.00">',
    `  <NFe><infNFe Id="NFe${accessKey}">`,
    `    <ide><nNF>${number}</nNF></ide>`,
    `    <dest><xNome>${recipient}</xNome></dest>`,
    `    <total><vProd>${tax.operationValue.toFixed(2)}</vProd>`,
    `      <vBC>${tax.taxBase.toFixed(2)}</vBC><vICMS>${tax.taxAmount.toFixed(2)}</vICMS></total>`,
    '  </infNFe></NFe>',
    '</nfeProc>',
  ].join('\n');
}

/**
 * Emite a nota (mock SEFAZ): calcula o imposto, gera chave de acesso e autoriza.
 * A integração real substitui esta função pela chamada ao webservice da SEFAZ.
 */
export async function emitInvoice(input: EmitInput) {
  let costPrice: number | null = null;
  if (input.vehicleId) {
    const v = await prisma.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: { id: true, costPrice: true },
    });
    if (!v) throw badRequest('Veículo inválido');
    costPrice = v.costPrice ? Number(v.costPrice) : null;
  }
  if (input.operationValue <= 0) throw badRequest('Valor da operação deve ser maior que zero');

  const tax = computeTax(input.kind, { operationValue: input.operationValue, costPrice });
  const isNfse = input.kind === FiscalKind.NFSE;
  const accessKey = isNfse ? null : generateAccessKey();

  // mock de autorização: >90% autorizadas; documento do destinatário ausente → rejeitada
  const rejected = !input.recipientDoc;
  const status = rejected ? FiscalStatus.REJECTED : FiscalStatus.AUTHORIZED;

  const created = await prisma.fiscalInvoice.create({
    data: {
      kind: input.kind,
      status,
      accessKey,
      recipientName: input.recipientName.trim(),
      recipientDoc: input.recipientDoc ? onlyDigits(input.recipientDoc) : null,
      operationValue: new Prisma.Decimal(tax.operationValue),
      taxBase: new Prisma.Decimal(tax.taxBase),
      taxRate: new Prisma.Decimal(tax.taxRate),
      taxAmount: new Prisma.Decimal(tax.taxAmount),
      taxLabel: tax.taxLabel,
      vehicleId: input.vehicleId ?? null,
      rejectReason: rejected ? 'Destinatário sem CPF/CNPJ informado (rejeição SEFAZ simulada).' : null,
      xml: rejected || !accessKey ? null : buildXml(0, accessKey, tax, input.recipientName),
    },
    include,
  });

  logger.info('nota fiscal emitida (mock)', {
    invoiceId: created.id,
    number: created.number,
    kind: input.kind,
    status,
  });
  return serialize(created);
}

export async function cancelInvoice(id: string) {
  const existing = await prisma.fiscalInvoice.findUnique({ where: { id } });
  if (!existing) throw notFound('Nota não encontrada');
  if (existing.status !== FiscalStatus.AUTHORIZED) {
    throw badRequest('Apenas notas autorizadas podem ser canceladas');
  }
  const row = await prisma.fiscalInvoice.update({
    where: { id },
    data: { status: FiscalStatus.CANCELED },
    include,
  });
  return serialize(row);
}
