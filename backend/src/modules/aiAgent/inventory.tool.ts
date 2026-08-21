import { Prisma, VehicleSaleStatus, VehicleType } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Acesso do agente ao estoque da PRÓPRIA loja.
 *
 * ── Por que SQL e não busca vetorial ───────────────────────────────────────
 * "Corolla até 80 mil, automático, abaixo de 60 mil km" é uma cláusula WHERE.
 * Embeddings devolvem o que é semanticamente próximo, e proximidade semântica
 * não respeita teto de preço: quem pede "até 80 mil" não pode receber um carro
 * de 95 mil. Além disso o estoque muda o tempo todo - carro vendido some do SQL
 * no mesmo instante, enquanto um índice vetorial só some depois de reindexar.
 *
 * ── Isolamento ──────────────────────────────────────────────────────────────
 * `accountId` NUNCA é parâmetro do modelo: vem do ticket, pelo AgentToolContext.
 * Um parâmetro exposto ao modelo é um parâmetro que uma injeção de prompt na
 * mensagem do cliente pode tentar preencher.
 */

/** O que o cliente pode ver: à venda ou reservado. Preparação e vendidos, não. */
const VISIBLE_STATUS: VehicleSaleStatus[] = [VehicleSaleStatus.AVAILABLE, VehicleSaleStatus.RESERVED];

const TYPE_MAP: Record<string, VehicleType> = {
  carro: VehicleType.CAR,
  moto: VehicleType.MOTORCYCLE,
  pesado: VehicleType.HEAVY,
};

export interface InventorySearchInput {
  marca?: string;
  modelo?: string;
  precoMax?: number;
  precoMin?: number;
  anoMin?: number;
  kmMax?: number;
  combustivel?: string;
  tipo?: string;
}

const money = (v: Prisma.Decimal | null) => (v == null ? null : Number(v));
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

/**
 * Serializa para o modelo apenas o que é público. Custo de compra, margem,
 * placa, chassi e renavam nunca entram - a mesma fronteira que a vitrine aplica.
 * O modelo não pode revelar o que nunca recebeu.
 */
function publicView(v: {
  id: string;
  brand: string;
  model: string;
  version: string | null;
  yearFabrication: number;
  yearModel: number;
  color: string | null;
  fuel: string | null;
  km: number;
  salePrice: Prisma.Decimal;
  optionals: Prisma.JsonValue;
  status: VehicleSaleStatus;
}) {
  const optionals = Array.isArray(v.optionals) ? (v.optionals as string[]).slice(0, 8) : [];
  return {
    id: v.id,
    titulo: [v.brand, v.model, v.version].filter(Boolean).join(' '),
    ano: `${v.yearFabrication}/${v.yearModel}`,
    km: v.km,
    cor: v.color,
    combustivel: v.fuel,
    preco: brl(money(v.salePrice) ?? 0),
    opcionais: optionals,
    reservado: v.status === VehicleSaleStatus.RESERVED,
  };
}

/** Busca no pátio da conta. Devolve poucas opções - o agente não deve despejar lista. */
export async function searchInventory(accountId: string, input: InventorySearchInput, limit = 5) {
  const and: Prisma.VehicleWhereInput[] = [
    { accountId },
    { status: { in: VISIBLE_STATUS } },
    { showOnSite: true },
  ];

  if (input.marca) and.push({ brand: { contains: input.marca.trim(), mode: 'insensitive' } });
  if (input.modelo) and.push({ model: { contains: input.modelo.trim(), mode: 'insensitive' } });
  if (input.combustivel) and.push({ fuel: { contains: input.combustivel.trim(), mode: 'insensitive' } });

  const tipo = input.tipo ? TYPE_MAP[input.tipo.trim().toLowerCase()] : undefined;
  if (tipo) and.push({ type: tipo });

  // Filtros numéricos são exatos de propósito - é o motivo de não usar vetor.
  if (typeof input.precoMax === 'number' && input.precoMax > 0) and.push({ salePrice: { lte: input.precoMax } });
  if (typeof input.precoMin === 'number' && input.precoMin > 0) and.push({ salePrice: { gte: input.precoMin } });
  if (typeof input.anoMin === 'number' && input.anoMin > 1950) and.push({ yearModel: { gte: input.anoMin } });
  if (typeof input.kmMax === 'number' && input.kmMax > 0) and.push({ km: { lte: input.kmMax } });

  const rows = await prisma.vehicle.findMany({
    where: { AND: and },
    orderBy: [{ featured: 'desc' }, { salePrice: 'asc' }],
    take: limit,
    select: {
      id: true, brand: true, model: true, version: true, yearFabrication: true, yearModel: true,
      color: true, fuel: true, km: true, salePrice: true, optionals: true, status: true,
    },
  });

  const total = await prisma.vehicle.count({ where: { AND: and } });
  return { encontrados: total, mostrando: rows.length, veiculos: rows.map(publicView) };
}

/** Ficha pública de um veículo. Id de outra conta responde como inexistente. */
export async function getInventoryDetail(accountId: string, vehicleId: string) {
  const v = await prisma.vehicle.findFirst({
    where: { id: vehicleId, accountId, status: { in: VISIBLE_STATUS }, showOnSite: true },
    select: {
      id: true, brand: true, model: true, version: true, yearFabrication: true, yearModel: true,
      color: true, fuel: true, km: true, salePrice: true, optionals: true, status: true,
      description: true, photos: { select: { url: true }, take: 1 },
    },
  });
  if (!v) return null;
  return {
    ...publicView(v),
    descricao: v.description?.slice(0, 600) ?? null,
    temFoto: v.photos.length > 0,
  };
}
