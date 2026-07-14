export type Role = 'ADMIN' | 'AGENT';

export type AccountStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'EXPIRED' | 'CANCELED';

export interface AccountSummary {
  id: string;
  name: string;
  status: AccountStatus;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Presente em /auth/me; ausente na resposta de login. */
  account?: AccountSummary | null;
}

export interface UserListItem extends PublicUser {
  active: boolean;
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
  /** Preview da última mensagem — presente apenas na listagem. */
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

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  AGENT: 'Atendente',
};

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

export const VEHICLE_STATUS_ORDER: VehicleStatus[] = ['PREPARING', 'AVAILABLE', 'RESERVED', 'SOLD', 'CONSIGNED'];

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
  source: string;
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
  manual: 'Manual',
};

export const platformLabel = (slug: string): string => PLATFORM_LABELS[slug] ?? slug;
