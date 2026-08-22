export type Role = 'ADMIN' | 'AGENT';

/**
 * Slug de permissão (`modulo.acao`). O catálogo completo mora no back-end
 * (src/modules/roles/permissions.ts) e chega pronto na tela de perfis - aqui
 * o tipo é aberto de propósito: duplicar a lista significaria mantê-la em dois
 * lugares e vê-las divergir no primeiro módulo novo.
 */
export type Permission = string;

/** Um perfil de acesso da loja, como a API o devolve. */
export interface AccessProfile {
  id: string;
  name: string;
  description: string | null;
  /** 'admin' | 'agent' nos perfis que nascem com a conta; null nos criados pelo lojista. */
  systemKey: string | null;
  permissions: Permission[];
  /** Com as implicações resolvidas - é o que a tela mostra marcado. */
  effectivePermissions: Permission[];
  /** Perfil de administrador: existe sempre e não é editável nem removível. */
  locked: boolean;
  userCount: number;
  createdAt: string;
}

export interface PermissionDef {
  key: Permission;
  label: string;
  description: string;
  implies?: Permission[];
}

export interface PermissionGroup {
  key: string;
  label: string;
  hint: string;
  permissions: PermissionDef[];
}

/** Ponto de partida oferecido no "Novo perfil" - não é linha no banco. */
export interface ProfileTemplate {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
}

export interface PermissionCatalog {
  groups: PermissionGroup[];
  templates: ProfileTemplate[];
}

export type AccountStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'EXPIRED' | 'CANCELED';

export interface AccountSummary {
  id: string;
  name: string;
  status: AccountStatus;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
}

// ─── Assinatura e pagamentos ─────────────────────────────────────────────────

export type BillingCycle = 'MONTHLY' | 'YEARLY';
export type BillingMethod = 'CREDIT_CARD' | 'PIX' | 'BOLETO';
export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
export type ChargeStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'RECEIVED'
  | 'OVERDUE'
  | 'REFUNDED'
  | 'CANCELED'
  | 'CHARGEBACK'
  | 'FAILED';

export interface PlanFeatures {
  maxUsers: number;
  maxVehicles: number;
  aiMessagesPerMonth: number | null;
  creditQueriesPerMonth: number | null;
  whatsappNumbers: number;
  modules: string[];
  prioritySupport?: boolean;
}

export interface BillingPlan {
  code: string;
  name: string;
  description: string | null;
  priceCents: number;
  priceYearlyCents: number | null;
  highlight: boolean;
  features: PlanFeatures;
  cycles: BillingCycle[];
}

export interface BillingCharge {
  id: string;
  status: ChargeStatus;
  method: BillingMethod;
  amountCents: number;
  description: string | null;
  dueDate: string;
  paidAt: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  receiptUrl: string | null;
  nfseUrl: string | null;
  nfseStatus: string | null;
}

export interface BillingSubscription {
  status: SubscriptionStatus;
  planCode: string;
  planName: string;
  cycle: BillingCycle;
  method: BillingMethod;
  priceCents: number;
  startedAt: string;
  currentPeriodEnd: string | null;
  nextDueDate: string | null;
  canceledAt: string | null;
  cancelAtPeriodEnd: boolean;
  card: { brand: string; last4: string; holder: string | null } | null;
  connected: boolean;
}

export interface UsageStatus {
  metric: 'AI_MESSAGE' | 'CREDIT_QUERY';
  period: string;
  used: number;
  quota: number | null;
  remaining: number | null;
  exceeded: boolean;
}

export interface PlanLimitItem {
  resource: string;
  label: string;
  used: number;
  max: number;
}

export interface BillingOverview {
  account: {
    status: AccountStatus;
    trialEndsAt: string | null;
    billingName: string | null;
    billingEmail: string | null;
    billingDocument: string | null;
    billingPhone: string | null;
  };
  subscription: BillingSubscription | null;
  charges: BillingCharge[];
  usage: UsageStatus[];
  limits: { planCode: string; planName: string; items: PlanLimitItem[] } | null;
  plans: BillingPlan[];
  gatewayEnabled: boolean;
  methodsByCycle: Record<BillingCycle, BillingMethod[]>;
}

export interface PayerDefaults {
  name: string;
  document: string;
  email: string;
  phone: string;
}

export interface SubscribeResult {
  subscription: BillingSubscription | null;
  /** Página hospedada do gateway - onde o cartão é digitado. */
  checkoutUrl: string | null;
  charge: BillingCharge | null;
}

export interface ChargePix {
  payload: string;
  qrCodeBase64: string | null;
  expiresAt: string | null;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Presentes em /auth/me; ausentes na resposta de login (que só identifica). */
  profile?: { id: string; name: string } | null;
  /** Lista efetiva - é o que `can()` consulta para acender menus e rotas. */
  permissions?: Permission[];
  account?: AccountSummary | null;
  /** Booleano rígido do servidor: só true para a ÚNICA conta-plataforma
   *  (PLATFORM_ACCOUNT_ID). Não é uma permissão - não depende de perfil. */
  isPlatformAdmin?: boolean;
}

export interface UserListItem {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  profile: { id: string; name: string } | null;
}

export type TicketStatus = 'NEW' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'CONVERTED' | 'LOST' | 'ARCHIVED';
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type InteractionType =
  | 'CUSTOMER_MESSAGE'
  | 'AGENT_REPLY'
  | 'INTERNAL_NOTE'
  | 'STATUS_CHANGE'
  | 'ASSIGNMENT'
  | 'SYSTEM';

export interface VehicleRef {
  externalId?: string;
  title?: string;
  price?: number;
  url?: string;
  [extra: string]: unknown;
}

export interface LeadSummary {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  anonymizedAt: string | null;
}

export interface Sla {
  firstResponseSeconds: number;
  pending: boolean;
  breached: boolean;
  limitMinutes: number;
}

export interface LastMessage {
  body: string;
  type: InteractionType;
  createdAt: string;
}

export interface Ticket {
  id: string;
  number: number;
  status: TicketStatus;
  priority: TicketPriority;
  platform: string;
  campaign: string | null;
  /** Agente de Pré-Venda IA ativo nesta conversa (bot_ativo). */
  botEnabled: boolean;
  vehicle: VehicleRef | null;
  lead: LeadSummary;
  assignedTo: { id: string; name: string } | null;
  sla: Sla;
  firstResponseAt: string | null;
  lastCustomerMessageAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Preview da última mensagem - presente apenas na listagem. */
  lastMessage?: LastMessage | null;
}

export interface Interaction {
  id: string;
  type: InteractionType;
  body: string | null;
  metadata: Record<string, unknown> | null;
  author: { id: string; name: string } | null;
  createdAt: string;
}

export interface TicketDetail extends Ticket {
  interactions: Interaction[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TicketStats {
  byStatus: Record<TicketStatus, number>;
  total: number;
  unassigned: number;
}

export interface TicketMetrics {
  windowDays: number;
  totalAll: number;
  openNow: number;
  createdInWindow: number;
  converted: number;
  lost: number;
  conversionRate: number; // 0..1
  avgFirstResponseSeconds: number | null;
  slaLimitMinutes: number;
  slaBreachedNow: number;
  awaitingResponse: number;
  byStatus: Record<TicketStatus, number>;
  byPlatform: Array<{ platform: string; count: number }>;
}

export const STATUS_ORDER: TicketStatus[] = [
  'NEW',
  'IN_PROGRESS',
  'WAITING_CUSTOMER',
  'CONVERTED',
  'LOST',
  'ARCHIVED',
];

export const STATUS_LABELS: Record<TicketStatus, string> = {
  NEW: 'Novo',
  IN_PROGRESS: 'Em atendimento',
  WAITING_CUSTOMER: 'Aguardando cliente',
  CONVERTED: 'Convertido',
  LOST: 'Perdido',
  ARCHIVED: 'Arquivado',
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: 'Baixa',
  NORMAL: 'Normal',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

/** Rótulo do nível base. Onde houver perfil, prefira o nome dele - é o que o
 *  lojista escreveu e reconhece ("Gerente de vendas", "Financeiro"). */
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  AGENT: 'Atendente',
};

/** Como chamar o acesso de alguém na tela: o perfil, com o nível como reserva. */
export const accessLabel = (user: { role: Role; profile?: { name: string } | null } | null): string =>
  user ? (user.profile?.name ?? ROLE_LABELS[user.role]) : '-';

// ─── Integrações ─────────────────────────────────────────────────────────────
export type IntegrationStatus = 'AVAILABLE' | 'CONNECTED' | 'AUTH_ERROR' | 'DISABLED';

export interface CredentialField {
  key: string;
  label: string;
  type: 'text' | 'password';
  placeholder?: string;
  help?: string;
  required?: boolean;
}

export interface Integration {
  platform: string;
  displayName: string;
  description: string;
  docsUrl: string | null;
  supportsOutbound: boolean;
  /** true = cada atendente conecta um remetente próprio em Meus Dados › Canais. */
  supportsUserChannels: boolean;
  canValidate: boolean;
  credentialFields: CredentialField[];
  status: IntegrationStatus;
  syncEnabled: boolean;
  accountLabel: string | null;
  connectedAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  hasCredentials: boolean;
  maskedCredentials: Array<{ key: string; masked: string }>;
  /** Endpoint exclusivo desta loja (null enquanto a plataforma não for conectada). */
  webhookUrl: string | null;
  hasInboundSecret: boolean;
}

export type DispatchStatus = 'SENT' | 'FAILED' | 'SKIPPED';

export interface IntegrationDetail extends Integration {
  health: {
    inbound: { received: number; processed: number; failed: number; lastEventAt: string | null };
    outbound: {
      sent: number;
      failed: number;
      skipped: number;
      recent: Array<{
        id: string;
        status: DispatchStatus;
        detail: string | null;
        externalRef: string | null;
        ticketId: string | null;
        createdAt: string;
      }>;
    };
  };
}

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  AVAILABLE: 'Disponível',
  CONNECTED: 'Conectado',
  AUTH_ERROR: 'Erro de autenticação',
  DISABLED: 'Pausado',
};

// ─── Estoque / Garagem Digital ───────────────────────────────────────────────
export type VehicleType = 'CAR' | 'MOTORCYCLE' | 'HEAVY';
export type VehicleStatus = 'PREPARING' | 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'CONSIGNED';

export interface VehiclePhoto {
  id: string;
  url: string;
  type: 'PHOTO' | 'VIDEO';
  position: number;
  isCover: boolean;
}

export interface VehicleCost {
  id: string;
  category: string;
  description: string;
  amount: number;
  incurredAt: string;
}

export interface VehicleCard {
  id: string;
  type: VehicleType;
  brand: string;
  model: string;
  version: string | null;
  yearFabrication: number;
  yearModel: number;
  km: number;
  color: string | null;
  fuel: string | null;
  status: VehicleStatus;
  salePrice: number | null;
  showOnSite: boolean;
  featured: boolean;
  coverUrl: string | null;
  photoCount: number;
  createdAt: string;
}

export interface VehicleDetail {
  id: string;
  type: VehicleType;
  brand: string;
  model: string;
  version: string | null;
  yearFabrication: number;
  yearModel: number;
  color: string | null;
  fuel: string | null;
  km: number;
  plate: string | null;
  chassi: string | null;
  renavam: string | null;
  fipePrice: number | null;
  costPrice: number | null;
  salePrice: number | null;
  status: VehicleStatus;
  optionals: string[];
  notes: string | null;
  description: string | null;
  showOnSite: boolean;
  featured: boolean;
  margin: number | null;
  totalCosts: number;
  photos: VehiclePhoto[];
  costs: VehicleCost[];
  createdAt: string;
  updatedAt: string;
}

export interface VehicleFacets {
  brands: string[];
  years: number[];
  byStatus: Record<VehicleStatus, number>;
  total: number;
}

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  CAR: 'Carro',
  MOTORCYCLE: 'Moto',
  HEAVY: 'Pesado',
};

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  PREPARING: 'Em preparação',
  AVAILABLE: 'Disponível',
  RESERVED: 'Reservado',
  SOLD: 'Vendido',
  CONSIGNED: 'Consignado',
};

/** O que cada status significa na operação - texto do painel de status. */
export const VEHICLE_STATUS_HINTS: Record<VehicleStatus, string> = {
  PREPARING: 'Chegou ao pátio e está em revisão, estética ou documentação.',
  AVAILABLE: 'Pronto para venda e liberado para a vitrine.',
  RESERVED: 'Com proposta ou sinal do cliente - segue na vitrine, marcado como reservado.',
  SOLD: 'Venda concluída - sai da vitrine e do estoque ativo.',
  CONSIGNED: 'De terceiro, à venda pela loja - não entra na vitrine.',
};

export interface VehicleStatusGroup {
  id: string;
  label: string;
  hint: string;
  statuses: VehicleStatus[];
}

/**
 * Os cinco status vistos como três etapas, agrupados pelo que têm em comum na
 * operação - a vitrine publica só Disponível e Reservado (PUBLIC_STATUSES no
 * storefront). O agrupamento é a fonte única: dita a ordem dos chips, o
 * espaçamento entre eles e as seções do painel de status.
 */
export const VEHICLE_STATUS_GROUPS: VehicleStatusGroup[] = [
  {
    id: 'yard',
    label: 'No pátio',
    hint: 'Em estoque, ainda fora da vitrine.',
    statuses: ['PREPARING', 'CONSIGNED'],
  },
  {
    id: 'showcase',
    label: 'Na vitrine',
    hint: 'Publicados no site para o cliente final.',
    statuses: ['AVAILABLE', 'RESERVED'],
  },
  {
    id: 'closed',
    label: 'Encerrado',
    hint: 'Fora do estoque ativo.',
    statuses: ['SOLD'],
  },
];

/** Ordem canônica dos status: a leitura do ciclo, derivada dos grupos. */
export const VEHICLE_STATUS_ORDER: VehicleStatus[] = VEHICLE_STATUS_GROUPS.flatMap((g) => g.statuses);

/** Status que a vitrine publica - usado para resumir o estoque no cabeçalho. */
export const VEHICLE_SHOWCASE_STATUSES: VehicleStatus[] =
  VEHICLE_STATUS_GROUPS.find((g) => g.id === 'showcase')?.statuses ?? [];

export const FUEL_OPTIONS = ['Flex', 'Gasolina', 'Etanol', 'Diesel', 'Elétrico', 'Híbrido', 'GNV'];

// ─── Análise de Crédito & Bureau ─────────────────────────────────────────────
export type CreditDocType = 'CPF' | 'CNPJ';
export type ScoreBand = 'HIGH_RISK' | 'MEDIUM_RISK' | 'LOW_RISK';

export interface CreditReport {
  document: string;
  docType: CreditDocType;
  name: string;
  score: number;
  band: ScoreBand;
  bandLabel: string;
  headline: string;
  restrictions: {
    hasRestrictions: boolean;
    protests: number;
    negativacoes: number;
    badChecks: number;
    judicialActions: number;
    totalAmount: number;
  };
  company?: {
    active: boolean;
    situation: string;
    openedYear: number;
  };
  credit: {
    limit: number;
    downPaymentPct: number;
    downPaymentLabel: string;
    installmentEstimate: number;
  };
  queriedAt: string;
  /** 'mock' = simulado; qualquer outro valor é o slug do bureau real. */
  source: string;
  /** false quando o nome veio do nosso cadastro, não do bureau. */
  nameConfirmed?: boolean;
  /** Renda (PF) ou faturamento (PJ) presumido pelo bureau. */
  incomeEstimate?: number;
  /** Protocolo do bureau - prova da consulta perante o titular (LGPD art. 20). */
  protocol?: string;
  /** true quando o bureau reaproveitou consulta recente e não tarifou de novo. */
  requeried?: boolean;
}

export interface CreditQuery {
  id: string;
  score: number;
  report: CreditReport;
  leadId: string | null;
  lead: { id: string; name: string } | null;
  createdAt: string;
}

export interface LeadSearchResult {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  platform: string;
  /** CPF/CNPJ já no cadastro (dígitos) - prefixa a consulta de crédito. */
  document: string | null;
}

// ─── Administrativo & Fiscal ─────────────────────────────────────────────────
export type FinancialType = 'PAYABLE' | 'RECEIVABLE';
export type FinancialStatus = 'PENDING' | 'PAID' | 'OVERDUE';

export interface VehicleRefMini {
  id: string;
  brand: string;
  model: string;
  plate: string | null;
}

export interface FinancialEntry {
  id: string;
  type: FinancialType;
  status: FinancialStatus;
  category: string;
  description: string;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  vehicle: VehicleRefMini | null;
  createdAt: string;
}

export interface FinanceSummary {
  balance: number;
  receivableMonth: number;
  payableMonth: number;
  projectedMonth: number;
  overdueCount: number;
}

export type FiscalKind = 'NFE_ENTRY' | 'NFE_EXIT' | 'NFE_RETURN' | 'NFSE';
export type FiscalStatus = 'PROCESSING' | 'AUTHORIZED' | 'CANCELED' | 'REJECTED';

export interface FiscalInvoice {
  id: string;
  number: number;
  kind: FiscalKind;
  status: FiscalStatus;
  accessKey: string | null;
  recipientName: string;
  recipientDoc: string | null;
  operationValue: number;
  taxBase: number;
  taxRate: number;
  taxAmount: number;
  taxLabel: string;
  vehicle: VehicleRefMini | null;
  rejectReason: string | null;
  issuedAt: string;
  xml: string | null;
}

export const FINANCIAL_STATUS_LABELS: Record<FinancialStatus, string> = {
  PENDING: 'Pendente',
  PAID: 'Pago',
  OVERDUE: 'Atrasado',
};

export const FINANCIAL_CATEGORIES = [
  'Venda de Veículo',
  'Comissão',
  'Preparação de Veículo',
  'Combustível',
  'Aluguel',
  'Salários',
  'Impostos',
  'Outros',
];

export const FISCAL_KIND_LABELS: Record<FiscalKind, string> = {
  NFE_ENTRY: 'NF-e Entrada',
  NFE_EXIT: 'NF-e Saída',
  NFE_RETURN: 'NF-e Devolução',
  NFSE: 'NFS-e Serviço',
};

export const FISCAL_STATUS_LABELS: Record<FiscalStatus, string> = {
  PROCESSING: 'Processando',
  AUTHORIZED: 'Autorizada',
  CANCELED: 'Cancelada',
  REJECTED: 'Rejeitada',
};

// ─── Configurações & Empresa ─────────────────────────────────────────────────
export interface CompanySettings {
  tradeName: string;
  legalName: string;
  cnpj: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  logoUrl: string | null;
}

/** Configuração da vitrine pública da conta (ver storefront/types.ts para o
 *  lado consumidor - aqui é o contrato da tela de administração). */
export interface StorefrontSettings {
  slug: string;
  published: boolean;
  config: import('./storefront/types').StorefrontConfig;
  updatedAt: string;
}

export interface LeadFormField {
  key: string;
  label: string;
}
export interface LeadFormFieldConfig {
  enabled: boolean;
  required: boolean;
}
export interface LeadFormSettings {
  fields: LeadFormField[];
  config: Record<string, LeadFormFieldConfig>;
}

export const OPTIONAL_ITEMS = [
  'Ar condicionado',
  'Direção hidráulica',
  'Direção elétrica',
  'Vidros elétricos',
  'Travas elétricas',
  'Teto solar',
  'Bancos de couro',
  'Airbag',
  'ABS',
  'Central multimídia',
  'Câmera de ré',
  'Sensor de estacionamento',
  'Piloto automático',
  'Rodas de liga leve',
  'Faróis de LED',
  'Partida elétrica',
];

const PLATFORM_LABELS: Record<string, string> = {
  olx: 'OLX',
  mercadolivre: 'Mercado Livre',
  webmotors: 'Webmotors',
  whatsapp: 'WhatsApp',
  manual: 'Manual',
};

export const platformLabel = (slug: string): string => PLATFORM_LABELS[slug] ?? slug;

// ─── Canais de atendimento do próprio usuário ────────────────────────────────

/** Plataforma que oferece canal por atendente (hoje só o WhatsApp). */
export interface ChannelPlatform {
  platform: string;
  displayName: string;
}

/** Canal que ESTE atendente conectou. */
export interface UserChannel {
  platform: string;
  externalId: string;
  displayNumber: string;
  verifiedName: string | null;
  connectedAt: string;
}

/** Remetente da conta da loja que o atendente pode reivindicar. */
export interface ChannelSender {
  externalId: string;
  displayNumber: string;
  verifiedName?: string;
  /** Nome do colega que já usa este número, ou null se estiver livre. */
  takenBy: string | null;
  isMine: boolean;
}

/** Credencial de recepção de webhook de UMA loja (revelada sob demanda). */
export interface WebhookSecret {
  platform: string;
  webhookUrl: string;
  secret: string;
  /** Header em que a plataforma envia o segredo (ex.: x-olx-token). */
  header: string | null;
}

// ─── Agente de IA e motor de fluxo (config por loja) ─────────────────────────

export interface AgentProfileConfig {
  enabled: boolean;
  /** Sempre preenchido pela API - cai no nome da conta quando não configurado. */
  storeName: string | null;
  persona: string | null;
  rules: string | null;
  canSearchInventory: boolean;
  canQuoteCredit: boolean;
  canScheduleVisit: boolean;
  knowledge: {
    docCount: number;
    /** 'injected' = tudo vai no prompt; 'retrieval' = busca sob demanda. */
    mode: 'injected' | 'retrieval';
    budgetChars: number;
  };
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  updatedAt: string;
}

export interface FlowPolicyConfig {
  enabled: boolean;
  followUpDelaysMin: number[];
  autoCloseAfterMin: number;
  quietHoursStart: number;
  quietHoursEnd: number;
  timezone: string;
  businessDaysOnly: boolean;
  slaFirstResponseMin: number;
  followUpMode: 'ai' | 'template';
}

// ─── Plataforma (super-admin: todas as contas + acesso de suporte) ──────────

export interface PlatformPlanRef {
  code: string;
  name: string;
  priceCents: number;
}

export interface PlatformSubscriptionRef {
  status: SubscriptionStatus;
  cycle: BillingCycle;
  priceCents: number;
  nextDueDate: string | null;
  currentPeriodEnd?: string | null;
}

export interface PlatformAccountOverview {
  id: string;
  name: string;
  status: AccountStatus;
  createdAt: string;
  plan: PlatformPlanRef | null;
  subscription: PlatformSubscriptionRef | null;
  activeUsers: number;
  limits: { planCode: string; planName: string; items: PlanLimitItem[] } | null;
  lastCharge: BillingCharge | null;
}

export interface PlatformAccountUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
  profile: { name: string } | null;
}

export interface PlatformAccountDetail extends Omit<PlatformAccountOverview, 'lastCharge'> {
  charges: BillingCharge[];
  users: PlatformAccountUser[];
}

export interface PlatformSupportSession {
  id: string;
  account: { id: string; name: string };
  requestedBy: { id: string; name: string; email: string };
  reason: string | null;
  startedAt: string;
  expiresAt: string;
}

/** Resposta ao abrir uma sessão de suporte - o token entra no `sessionStorage`
 *  da nova aba, nunca no armazenamento da sessão normal do admin. */
export interface StartSupportSessionResult {
  accessToken: string;
  session: { id: string; accountId: string; accountName: string; expiresAt: string };
}
