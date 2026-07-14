import { Prisma, VehicleSaleStatus, VehicleType } from '@prisma/client';
import { badRequest, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { deleteByPublicUrl, saveImageDataUrl } from '../../lib/storage';
import { generateVehicleDescription } from './description.generator';

const dec = (d: Prisma.Decimal | null): number | null => (d == null ? null : Number(d));
const toDecimal = (n: number | null | undefined): Prisma.Decimal | null =>
  n == null ? null : new Prisma.Decimal(n);

const listInclude = {
  photos: { orderBy: [{ isCover: 'desc' as const }, { position: 'asc' as const }] },
} satisfies Prisma.VehicleInclude;

const detailInclude = {
  photos: { orderBy: [{ position: 'asc' as const }] },
  costs: { orderBy: [{ incurredAt: 'desc' as const }] },
} satisfies Prisma.VehicleInclude;

type VehicleListRow = Prisma.VehicleGetPayload<{ include: typeof listInclude }>;
type VehicleDetailRow = Prisma.VehicleGetPayload<{ include: typeof detailInclude }>;

function coverUrl(photos: { url: string; isCover: boolean; position: number }[]): string | null {
  if (photos.length === 0) return null;
  return (photos.find((p) => p.isCover) ?? photos[0]).url;
}

export function serializeVehicleCard(v: VehicleListRow) {
  return {
    id: v.id,
    type: v.type,
    brand: v.brand,
    model: v.model,
    version: v.version,
    yearFabrication: v.yearFabrication,
    yearModel: v.yearModel,
    km: v.km,
    color: v.color,
    fuel: v.fuel,
    status: v.status,
    salePrice: dec(v.salePrice),
    coverUrl: coverUrl(v.photos),
    photoCount: v.photos.length,
    createdAt: v.createdAt,
  };
}

export function serializeVehicleDetail(v: VehicleDetailRow) {
  const salePrice = dec(v.salePrice);
  const costPrice = dec(v.costPrice);
  const totalCosts = v.costs.reduce((acc, c) => acc + Number(c.amount), 0);
  return {
    id: v.id,
    type: v.type,
    brand: v.brand,
    model: v.model,
    version: v.version,
    yearFabrication: v.yearFabrication,
    yearModel: v.yearModel,
    color: v.color,
    fuel: v.fuel,
    km: v.km,
    plate: v.plate,
    chassi: v.chassi,
    renavam: v.renavam,
    fipePrice: dec(v.fipePrice),
    costPrice,
    salePrice,
    status: v.status,
    optionals: (v.optionals as string[]) ?? [],
    notes: v.notes,
    description: v.description,
    // margem: venda − custo de compra − gastos acumulados
    margin: salePrice != null ? salePrice - (costPrice ?? 0) - totalCosts : null,
    totalCosts,
    photos: v.photos.map((p) => ({ id: p.id, url: p.url, position: p.position, isCover: p.isCover })),
    costs: v.costs.map((c) => ({
      id: c.id,
      category: c.category,
      description: c.description,
      amount: Number(c.amount),
      incurredAt: c.incurredAt,
    })),
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

// ─── Listagem + filtros ──────────────────────────────────────────────────────

export interface ListVehiclesParams {
  brand?: string;
  model?: string;
  year?: number; // casa com yearFabrication OU yearModel
  status?: VehicleSaleStatus;
  type?: VehicleType;
  search?: string;
  page: number;
  pageSize: number;
}

export async function listVehicles(params: ListVehiclesParams) {
  const and: Prisma.VehicleWhereInput[] = [];
  if (params.brand) and.push({ brand: { equals: params.brand, mode: 'insensitive' } });
  if (params.model) and.push({ model: { contains: params.model, mode: 'insensitive' } });
  if (params.status) and.push({ status: params.status });
  if (params.type) and.push({ type: params.type });
  if (params.year) and.push({ OR: [{ yearFabrication: params.year }, { yearModel: params.year }] });
  if (params.search?.trim()) {
    const s = params.search.trim();
    and.push({
      OR: [
        { brand: { contains: s, mode: 'insensitive' } },
        { model: { contains: s, mode: 'insensitive' } },
        { version: { contains: s, mode: 'insensitive' } },
        { plate: { contains: s, mode: 'insensitive' } },
      ],
    });
  }

  const where: Prisma.VehicleWhereInput = { AND: and };
  const [total, rows] = await prisma.$transaction([
    prisma.vehicle.count({ where }),
    prisma.vehicle.findMany({
      where,
      include: listInclude,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
  ]);

  return { items: rows.map(serializeVehicleCard), total, page: params.page, pageSize: params.pageSize };
}

/** Opções para os filtros rápidos (marcas distintas + faixa de anos). */
export async function vehicleFacets() {
  const [brands, years, statusGroups] = await Promise.all([
    prisma.vehicle.findMany({ distinct: ['brand'], select: { brand: true }, orderBy: { brand: 'asc' } }),
    prisma.vehicle.findMany({ distinct: ['yearModel'], select: { yearModel: true }, orderBy: { yearModel: 'desc' } }),
    prisma.vehicle.groupBy({ by: ['status'], _count: true }),
  ]);
  const byStatus = Object.fromEntries(Object.values(VehicleSaleStatus).map((s) => [s, 0])) as Record<
    VehicleSaleStatus,
    number
  >;
  for (const g of statusGroups) byStatus[g.status] = g._count;
  return {
    brands: brands.map((b) => b.brand),
    years: years.map((y) => y.yearModel),
    byStatus,
    total: statusGroups.reduce((a, g) => a + g._count, 0),
  };
}

export async function getVehicle(id: string) {
  const v = await prisma.vehicle.findUnique({ where: { id }, include: detailInclude });
  if (!v) throw notFound('Veículo não encontrado');
  return serializeVehicleDetail(v);
}

// ─── Criar / editar ──────────────────────────────────────────────────────────

export interface VehicleInput {
  type: VehicleType;
  brand: string;
  model: string;
  version?: string | null;
  yearFabrication: number;
  yearModel: number;
  color?: string | null;
  fuel?: string | null;
  km: number;
  plate?: string | null;
  chassi?: string | null;
  renavam?: string | null;
  fipePrice?: number | null;
  costPrice?: number | null;
  salePrice: number;
  status: VehicleSaleStatus;
  optionals: string[];
  notes?: string | null;
  description?: string | null;
}

function toData(input: VehicleInput): Prisma.VehicleUncheckedCreateInput {
  return {
    type: input.type,
    brand: input.brand.trim(),
    model: input.model.trim(),
    version: input.version?.trim() || null,
    yearFabrication: input.yearFabrication,
    yearModel: input.yearModel,
    color: input.color?.trim() || null,
    fuel: input.fuel?.trim() || null,
    km: input.km,
    plate: input.plate?.trim().toUpperCase() || null,
    chassi: input.chassi?.trim() || null,
    renavam: input.renavam?.trim() || null,
    fipePrice: toDecimal(input.fipePrice),
    costPrice: toDecimal(input.costPrice),
    salePrice: new Prisma.Decimal(input.salePrice),
    status: input.status,
    optionals: input.optionals as Prisma.InputJsonValue,
    notes: input.notes?.trim() || null,
    description: input.description?.trim() || null,
  };
}

async function assertPlateFree(plate: string | null | undefined, ignoreId?: string) {
  if (!plate) return;
  const existing = await prisma.vehicle.findUnique({ where: { plate: plate.trim().toUpperCase() } });
  if (existing && existing.id !== ignoreId) throw badRequest('Já existe um veículo com esta placa');
}

export async function createVehicle(input: VehicleInput) {
  await assertPlateFree(input.plate);
  const v = await prisma.vehicle.create({ data: toData(input), include: detailInclude });
  return serializeVehicleDetail(v);
}

export async function updateVehicle(id: string, input: VehicleInput) {
  const exists = await prisma.vehicle.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw notFound('Veículo não encontrado');
  await assertPlateFree(input.plate, id);
  await prisma.vehicle.update({ where: { id }, data: toData(input) });
  return getVehicle(id);
}

export async function deleteVehicle(id: string) {
  const v = await prisma.vehicle.findUnique({ where: { id }, include: { photos: true } });
  if (!v) throw notFound('Veículo não encontrado');
  for (const p of v.photos) deleteByPublicUrl(p.url);
  await prisma.vehicle.delete({ where: { id } });
}

// ─── Fotos ───────────────────────────────────────────────────────────────────

export async function addPhotos(vehicleId: string, images: string[]) {
  const v = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: { photos: { orderBy: { position: 'asc' } } },
  });
  if (!v) throw notFound('Veículo não encontrado');

  let position = v.photos.length;
  const hadCover = v.photos.some((p) => p.isCover);
  for (let i = 0; i < images.length; i++) {
    const url = saveImageDataUrl(`vehicles/${vehicleId}`, images[i]);
    await prisma.vehiclePhoto.create({
      data: { vehicleId, url, position, isCover: !hadCover && position === 0 },
    });
    position++;
  }
  return getVehicle(vehicleId);
}

/** Reordena a galeria e/ou define a capa. `order` são os ids na nova ordem. */
export async function reorderPhotos(vehicleId: string, order: string[], coverId?: string) {
  const photos = await prisma.vehiclePhoto.findMany({ where: { vehicleId }, select: { id: true } });
  const known = new Set(photos.map((p) => p.id));
  if (order.some((id) => !known.has(id))) throw badRequest('Lista de ordenação inválida');

  await prisma.$transaction([
    ...order.map((id, index) =>
      prisma.vehiclePhoto.update({ where: { id }, data: { position: index } }),
    ),
    ...(coverId
      ? [
          prisma.vehiclePhoto.updateMany({ where: { vehicleId }, data: { isCover: false } }),
          prisma.vehiclePhoto.update({ where: { id: coverId }, data: { isCover: true } }),
        ]
      : []),
  ]);
  return getVehicle(vehicleId);
}

export async function deletePhoto(vehicleId: string, photoId: string) {
  const photo = await prisma.vehiclePhoto.findFirst({ where: { id: photoId, vehicleId } });
  if (!photo) throw notFound('Foto não encontrada');
  deleteByPublicUrl(photo.url);
  await prisma.vehiclePhoto.delete({ where: { id: photoId } });

  // se a capa foi removida, promove a primeira restante
  if (photo.isCover) {
    const next = await prisma.vehiclePhoto.findFirst({ where: { vehicleId }, orderBy: { position: 'asc' } });
    if (next) await prisma.vehiclePhoto.update({ where: { id: next.id }, data: { isCover: true } });
  }
  return getVehicle(vehicleId);
}

// ─── Co-piloto de descrição (IA) ─────────────────────────────────────────────

export async function generateDescription(vehicleId: string, extraNotes?: string) {
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!v) throw notFound('Veículo não encontrado');
  const description = generateVehicleDescription({
    type: v.type,
    brand: v.brand,
    model: v.model,
    version: v.version,
    yearFabrication: v.yearFabrication,
    yearModel: v.yearModel,
    color: v.color,
    fuel: v.fuel,
    km: v.km,
    optionals: (v.optionals as string[]) ?? [],
    extraNotes,
  });
  return { description };
}

// ─── Custos (histórico de gastos) ────────────────────────────────────────────

export interface CostInput {
  category: string;
  description: string;
  amount: number;
  incurredAt?: string;
}

export async function addCost(vehicleId: string, input: CostInput) {
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
  if (!v) throw notFound('Veículo não encontrado');
  await prisma.vehicleCost.create({
    data: {
      vehicleId,
      category: input.category.trim(),
      description: input.description.trim(),
      amount: new Prisma.Decimal(input.amount),
      incurredAt: input.incurredAt ? new Date(input.incurredAt) : undefined,
    },
  });
  return getVehicle(vehicleId);
}

export async function deleteCost(vehicleId: string, costId: string) {
  const cost = await prisma.vehicleCost.findFirst({ where: { id: costId, vehicleId } });
  if (!cost) throw notFound('Gasto não encontrado');
  await prisma.vehicleCost.delete({ where: { id: costId } });
  return getVehicle(vehicleId);
}

// ─── Consulta de placa (mock — integrará com API de placas no futuro) ────────

const PLATE_MOCK: Array<Partial<VehicleInput> & { fipePrice: number }> = [
  { brand: 'Honda', model: 'Civic', version: 'EXL 2.0 CVT', yearFabrication: 2020, yearModel: 2020, color: 'Prata', fuel: 'Flex', fipePrice: 112900 },
  { brand: 'Toyota', model: 'Corolla', version: 'XEi 2.0', yearFabrication: 2021, yearModel: 2022, color: 'Branco', fuel: 'Flex', fipePrice: 129900 },
  { brand: 'Jeep', model: 'Compass', version: 'Longitude T270', yearFabrication: 2022, yearModel: 2023, color: 'Cinza', fuel: 'Flex', fipePrice: 152990 },
  { brand: 'Volkswagen', model: 'T-Cross', version: 'Highline 1.4 TSI', yearFabrication: 2022, yearModel: 2022, color: 'Preto', fuel: 'Flex', fipePrice: 139900 },
];

/**
 * Simula a consulta de dados por placa. Retorna dados pré-preenchidos de forma
 * determinística (mesma placa → mesmo resultado). Substituir por integração real
 * (ex.: API de consulta veicular) mantendo este contrato de retorno.
 */
export async function lookupPlate(plate: string) {
  const normalized = plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (normalized.length < 7) throw badRequest('Placa inválida');
  await new Promise((r) => setTimeout(r, 350)); // simula latência
  const seed = [...normalized].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const base = PLATE_MOCK[seed % PLATE_MOCK.length];
  return {
    plate: normalized,
    found: true,
    data: { ...base, km: 20000 + (seed % 80) * 1000 },
    source: 'mock', // sinaliza que ainda não é a base oficial
  };
}
