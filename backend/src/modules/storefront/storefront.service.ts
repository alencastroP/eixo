import { Prisma, VehicleSaleStatus, VehicleType, type Storefront } from '@prisma/client';
import { badRequest, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { isBlocked } from '../billing/account.service';
import { getCompany } from '../settings/settings.service';

/**
 * Vitrine pública (landing page) da conta.
 *
 * Uma linha `storefronts` por conta guarda o endereço (slug → subdomínio), o
 * estado de publicação e a configuração visual/textual como JSON. O JSON segue
 * a mesma escolha de `settings`: campos novos entram sem migration, e o shape
 * é normalizado aqui (defaults + merge) para o resto do código sempre receber
 * a configuração completa.
 *
 * Este módulo também é o ÚNICO lugar que serializa veículo para o público —
 * os serializadores do estoque expõem custo, margem, placa e chassi, que jamais
 * podem sair pela rota aberta.
 */

// ─── Configuração ────────────────────────────────────────────────────────────

export interface StorefrontBrand {
  name: string; // nome exibido no site
  tagline: string; // frase curta sob o logo
  logoUrl: string | null;
  primary: string; // cor de destaque da loja (hex)
  theme: 'dark' | 'light';
}

export interface StorefrontHero {
  title: string;
  subtitle: string;
  imageUrl: string | null;
  ctaPrimary: string;
  ctaSecondary: string;
  badges: string[]; // selos curtos ("Aceitamos troca", "Financiamento em 24h"…)
}

export interface StorefrontHighlight {
  icon: string; // chave de ícone conhecida pelo front (shield, wallet, key, wrench…)
  title: string;
  text: string;
}

export interface StorefrontContact {
  phone: string;
  whatsapp: string; // somente dígitos, com DDI/DDD (ex.: 5584988013786)
  email: string;
  address: string;
  city: string;
  state: string;
  hours: string;
  mapUrl: string; // link "como chegar" (Google Maps)
  instagram: string;
  facebook: string;
}

/** Parâmetros da simulação de parcela exibida nos cards e no bloco de financiamento. */
export interface StorefrontFinancing {
  downPercent: number; // entrada padrão (%)
  months: number; // prazo padrão
  monthlyRate: number; // taxa de referência (% a.m.)
}

export interface StorefrontSections {
  featured: boolean;
  inventory: boolean;
  highlights: boolean;
  financing: boolean;
  sell: boolean;
  about: boolean;
  contact: boolean;
}

export interface StorefrontConfig {
  brand: StorefrontBrand;
  hero: StorefrontHero;
  highlights: StorefrontHighlight[];
  about: { title: string; text: string };
  contact: StorefrontContact;
  financing: StorefrontFinancing;
  sections: StorefrontSections;
  seo: { title: string; description: string };
}

export const DEFAULT_CONFIG: StorefrontConfig = {
  brand: { name: '', tagline: 'Seminovos selecionados', logoUrl: null, primary: '#ff6b35', theme: 'dark' },
  hero: {
    title: 'Seu próximo carro está aqui.',
    subtitle: 'Estoque revisado, procedência verificada e negociação sem enrolação.',
    imageUrl: null,
    ctaPrimary: 'Ver estoque',
    ctaSecondary: 'Vender meu veículo',
    badges: ['Aceitamos seu usado na troca', 'Financiamento em até 60x', 'Veículos revisados'],
  },
  highlights: [
    { icon: 'shield', title: 'Procedência verificada', text: 'Todo veículo passa por checagem de documentação e histórico antes de entrar no pátio.' },
    { icon: 'wallet', title: 'Financiamento facilitado', text: 'Trabalhamos com os principais bancos e aprovamos sua proposta no mesmo dia.' },
    { icon: 'swap', title: 'Avaliamos seu usado', text: 'Traga seu carro para avaliação gratuita e use como entrada.' },
    { icon: 'wrench', title: 'Revisão completa', text: 'Mecânica e estética revisadas antes da entrega das chaves.' },
  ],
  about: {
    title: 'Sobre a loja',
    text: '',
  },
  contact: {
    phone: '',
    whatsapp: '',
    email: '',
    address: '',
    city: '',
    state: '',
    hours: 'Seg a Sex: 8h às 18h · Sáb: 8h às 12h',
    mapUrl: '',
    instagram: '',
    facebook: '',
  },
  financing: { downPercent: 20, months: 48, monthlyRate: 1.99 },
  sections: { featured: true, inventory: true, highlights: true, financing: true, sell: true, about: true, contact: true },
  seo: { title: '', description: '' },
};

/** Merge raso por grupo: o que estiver salvo vence, o resto cai no default. */
export function mergeConfig(raw: unknown): StorefrontConfig {
  const v = (raw ?? {}) as Partial<StorefrontConfig>;
  return {
    brand: { ...DEFAULT_CONFIG.brand, ...(v.brand ?? {}) },
    hero: { ...DEFAULT_CONFIG.hero, ...(v.hero ?? {}) },
    highlights: Array.isArray(v.highlights) ? v.highlights : DEFAULT_CONFIG.highlights,
    about: { ...DEFAULT_CONFIG.about, ...(v.about ?? {}) },
    contact: { ...DEFAULT_CONFIG.contact, ...(v.contact ?? {}) },
    financing: { ...DEFAULT_CONFIG.financing, ...(v.financing ?? {}) },
    sections: { ...DEFAULT_CONFIG.sections, ...(v.sections ?? {}) },
    seo: { ...DEFAULT_CONFIG.seo, ...(v.seo ?? {}) },
  };
}

// ─── Slug ────────────────────────────────────────────────────────────────────

/** Nome da loja → slug de subdomínio (a-z, 0-9 e hífen). */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos (combining marks)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Slugs que colidiriam com hosts da própria plataforma. */
const RESERVED_SLUGS = new Set(['www', 'app', 'api', 'admin', 'eixo', 'crm', 'site', 'loja', 'painel', 'static', 'assets']);

async function ensureUniqueSlug(base: string, accountId: string): Promise<string> {
  const seed = slugify(base) || 'loja';
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? seed : `${seed}-${i + 1}`;
    if (RESERVED_SLUGS.has(candidate)) continue;
    const taken = await prisma.storefront.findUnique({ where: { slug: candidate }, select: { accountId: true } });
    if (!taken || taken.accountId === accountId) return candidate;
  }
  return `${seed}-${Date.now().toString(36)}`;
}

// ─── Administração (dentro do CRM) ───────────────────────────────────────────

function serialize(store: Storefront) {
  return {
    slug: store.slug,
    published: store.published,
    config: mergeConfig(store.config),
    updatedAt: store.updatedAt,
  };
}

/**
 * Vitrine da conta, criada sob demanda no primeiro acesso à tela de
 * configuração. Nasce despublicada, com slug derivado do nome da conta e os
 * dados de contato já pré-preenchidos a partir do cadastro da empresa —
 * o lojista só ajusta e publica.
 */
export async function getOrCreateStorefront(accountId: string) {
  const existing = await prisma.storefront.findUnique({ where: { accountId } });
  if (existing) return serialize(existing);

  const account = await prisma.account.findUnique({ where: { id: accountId }, select: { name: true } });

  // `settings.company` ainda é uma tabela GLOBAL (chave → JSON, sem accountId).
  // Aproveitá-la para pré-preencher só é seguro quando existe uma única conta —
  // com mais de uma, os dados pertenceriam a outro lojista. Quando o retrofit
  // de isolamento chegar a `settings`, esta condição pode cair.
  const soleAccount = (await prisma.account.count()) === 1;
  const company = soleAccount ? await getCompany() : null;

  const config: StorefrontConfig = {
    ...DEFAULT_CONFIG,
    brand: { ...DEFAULT_CONFIG.brand, name: company?.tradeName || account?.name || 'Minha Loja' },
    contact: company
      ? {
          ...DEFAULT_CONFIG.contact,
          phone: company.phone,
          whatsapp: onlyDigits(company.phone),
          email: company.email,
          address: company.address,
          city: company.city,
          state: company.state,
        }
      : DEFAULT_CONFIG.contact,
  };

  const created = await prisma.storefront.create({
    data: {
      accountId,
      slug: await ensureUniqueSlug(account?.name ?? 'loja', accountId),
      published: false,
      config: config as unknown as Prisma.InputJsonValue,
    },
  });
  return serialize(created);
}

export interface StorefrontUpdate {
  slug?: string;
  published?: boolean;
  config?: unknown;
}

export async function updateStorefront(accountId: string, patch: StorefrontUpdate) {
  await getOrCreateStorefront(accountId); // garante a linha

  const data: Prisma.StorefrontUpdateInput = {};

  if (patch.slug !== undefined) {
    const slug = slugify(patch.slug);
    if (slug.length < 3) throw badRequest('O endereço da vitrine precisa de ao menos 3 caracteres');
    if (RESERVED_SLUGS.has(slug)) throw badRequest(`"${slug}" é um endereço reservado. Escolha outro.`);
    const taken = await prisma.storefront.findUnique({ where: { slug }, select: { accountId: true } });
    if (taken && taken.accountId !== accountId) throw badRequest('Este endereço já está em uso por outra loja');
    data.slug = slug;
  }

  if (patch.published !== undefined) data.published = patch.published;
  if (patch.config !== undefined) data.config = mergeConfig(patch.config) as unknown as Prisma.InputJsonValue;

  const updated = await prisma.storefront.update({ where: { accountId }, data });
  return serialize(updated);
}

// ─── Lado público ────────────────────────────────────────────────────────────

/** Só entra na vitrine o que está à venda e marcado para exibição. */
const PUBLIC_STATUSES: VehicleSaleStatus[] = [VehicleSaleStatus.AVAILABLE, VehicleSaleStatus.RESERVED];

const publicWhere = (accountId: string): Prisma.VehicleWhereInput => ({
  accountId,
  showOnSite: true,
  status: { in: PUBLIC_STATUSES },
});

/**
 * Resolve o slug para a conta dona. Vitrine despublicada, conta bloqueada
 * (inadimplente/expirada) ou slug inexistente respondem igual — 404 — para não
 * revelar a existência de contas.
 */
async function resolvePublished(slug: string) {
  const store = await prisma.storefront.findUnique({
    where: { slug },
    include: { account: { select: { id: true, name: true, status: true } } },
  });
  if (!store || !store.published || isBlocked(store.account.status)) throw notFound('Vitrine não encontrada');
  return store;
}

const dec = (d: Prisma.Decimal | null): number | null => (d == null ? null : Number(d));

const publicInclude = {
  photos: { orderBy: [{ isCover: 'desc' as const }, { position: 'asc' as const }] },
} satisfies Prisma.VehicleInclude;

type PublicRow = Prisma.VehicleGetPayload<{ include: typeof publicInclude }>;

/**
 * Card público. Nada de custo, margem, placa, chassi ou renavam: o que sai aqui
 * é o que o visitante anônimo pode ver.
 */
function serializePublicCard(v: PublicRow) {
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
    price: dec(v.salePrice),
    reserved: v.status === VehicleSaleStatus.RESERVED,
    featured: v.featured,
    coverUrl: v.photos.find((p) => p.isCover)?.url ?? v.photos[0]?.url ?? null,
    photoCount: v.photos.length,
  };
}

function serializePublicDetail(v: PublicRow) {
  return {
    ...serializePublicCard(v),
    optionals: (v.optionals as string[]) ?? [],
    description: v.description,
    photos: v.photos.map((p) => ({ id: p.id, url: p.url })),
  };
}

/**
 * Recortes rápidos do estoque. O CRM não tem campo de câmbio nem de tração — a
 * informação vive no texto da versão ("1.0 Flex 4P Manual"), que é como o
 * lojista já cadastra e como as plataformas de anúncio publicam. Filtrar por
 * aqui mantém contagem e paginação corretas no servidor.
 */
export type PublicTag = 'automatico' | 'manual' | '4x4';

const TAG_TERM: Record<PublicTag, string> = { automatico: 'autom', manual: 'manual', '4x4': '4x4' };

export interface PublicListParams {
  search?: string;
  brand?: string;
  model?: string;
  year?: number;
  type?: VehicleType;
  priceMin?: number;
  priceMax?: number;
  tag?: PublicTag;
  sort?: 'recent' | 'priceAsc' | 'priceDesc' | 'kmAsc' | 'yearDesc';
  page: number;
  pageSize: number;
}

const ORDER_BY: Record<NonNullable<PublicListParams['sort']>, Prisma.VehicleOrderByWithRelationInput> = {
  recent: { createdAt: 'desc' },
  priceAsc: { salePrice: 'asc' },
  priceDesc: { salePrice: 'desc' },
  kmAsc: { km: 'asc' },
  yearDesc: { yearModel: 'desc' },
};

export async function listPublicVehicles(slug: string, params: PublicListParams) {
  const store = await resolvePublished(slug);
  const and: Prisma.VehicleWhereInput[] = [publicWhere(store.account.id)];

  if (params.brand) and.push({ brand: { equals: params.brand, mode: 'insensitive' } });
  if (params.model) and.push({ model: { contains: params.model, mode: 'insensitive' } });
  if (params.type) and.push({ type: params.type });
  if (params.year) and.push({ OR: [{ yearFabrication: params.year }, { yearModel: params.year }] });
  if (params.priceMin != null) and.push({ salePrice: { gte: new Prisma.Decimal(params.priceMin) } });
  if (params.priceMax != null) and.push({ salePrice: { lte: new Prisma.Decimal(params.priceMax) } });
  if (params.tag) and.push({ version: { contains: TAG_TERM[params.tag], mode: 'insensitive' } });
  if (params.search?.trim()) {
    const s = params.search.trim();
    and.push({
      OR: [
        { brand: { contains: s, mode: 'insensitive' } },
        { model: { contains: s, mode: 'insensitive' } },
        { version: { contains: s, mode: 'insensitive' } },
      ],
    });
  }

  const where: Prisma.VehicleWhereInput = { AND: and };
  const [total, rows] = await prisma.$transaction([
    prisma.vehicle.count({ where }),
    prisma.vehicle.findMany({
      where,
      include: publicInclude,
      orderBy: [{ featured: 'desc' }, ORDER_BY[params.sort ?? 'recent']],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
  ]);

  return { items: rows.map(serializePublicCard), total, page: params.page, pageSize: params.pageSize };
}

export async function getPublicVehicle(slug: string, id: string) {
  const store = await resolvePublished(slug);
  const v = await prisma.vehicle.findFirst({
    where: { id, ...publicWhere(store.account.id) },
    include: publicInclude,
  });
  if (!v) throw notFound('Veículo não encontrado');
  return serializePublicDetail(v);
}

/** Marcas, anos e faixa de preço presentes no estoque visível — alimentam os filtros. */
async function publicFacets(accountId: string) {
  const where = publicWhere(accountId);
  const [brands, years, aggregate] = await Promise.all([
    prisma.vehicle.groupBy({ by: ['brand'], where, _count: true, orderBy: { brand: 'asc' } }),
    prisma.vehicle.findMany({ where, distinct: ['yearModel'], select: { yearModel: true }, orderBy: { yearModel: 'desc' } }),
    prisma.vehicle.aggregate({ where, _min: { salePrice: true }, _max: { salePrice: true }, _count: true }),
  ]);
  return {
    brands: brands.map((b) => ({ name: b.brand, count: b._count })),
    years: years.map((y) => y.yearModel),
    priceMin: dec(aggregate._min.salePrice),
    priceMax: dec(aggregate._max.salePrice),
    total: aggregate._count,
  };
}

/** Payload de abertura da vitrine: identidade + destaques + filtros disponíveis. */
export async function getPublicSite(slug: string) {
  const store = await resolvePublished(slug);
  const config = mergeConfig(store.config);
  const [featured, facets] = await Promise.all([
    prisma.vehicle.findMany({
      where: { ...publicWhere(store.account.id), featured: true },
      include: publicInclude,
      orderBy: { updatedAt: 'desc' },
      take: 6,
    }),
    publicFacets(store.account.id),
  ]);

  return {
    slug: store.slug,
    // o nome da conta é o fallback quando o lojista não personalizou a marca
    store: { ...config, brand: { ...config.brand, name: config.brand.name || store.account.name } },
    featured: featured.map(serializePublicCard),
    facets,
  };
}

/** Conta dona do slug — usada pela rota de leads (que não expõe dados da loja). */
export async function resolveAccountId(slug: string): Promise<string> {
  const store = await resolvePublished(slug);
  return store.account.id;
}

export function onlyDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}
