import { api, type Session } from './client';
import type {
  AccessProfile,
  BillingCharge,
  BillingCycle,
  BillingMethod,
  BillingOverview,
  BillingPlan,
  BillingSubscription,
  ChannelPlatform,
  ChannelSender,
  ChargePix,
  CompanySettings,
  CreditQuery,
  PayerDefaults,
  SubscribeResult,
  FinanceSummary,
  FinancialEntry,
  FinancialType,
  FiscalInvoice,
  FiscalKind,
  AgentProfileConfig,
  FlowPolicyConfig,
  Integration,
  IntegrationDetail,
  KnowledgeDoc,
  WebhookSecret,
  LeadFormSettings,
  LeadSearchResult,
  Paged,
  PermissionCatalog,
  PlatformAccountDetail,
  PlatformAccountOverview,
  PlatformSupportSession,
  PublicUser,
  StartSupportSessionResult,
  StorefrontSettings,
  Ticket,
  TicketDetail,
  TicketMetrics,
  TicketPriority,
  TicketStats,
  TicketStatus,
  UserChannel,
  UserListItem,
  VehicleCard,
  VehicleDetail,
  VehicleFacets,
  VehicleStatus,
  VehicleType,
} from '../types';

export const authApi = {
  login: (email: string, password: string) =>
    api<Session>('/auth/login', { method: 'POST', body: { email, password } }),
  logout: (refreshToken: string) => api<void>('/auth/logout', { method: 'POST', body: { refreshToken } }),
  me: () => api<PublicUser>('/auth/me'),
  updateMe: (input: { name?: string; email?: string; currentPassword?: string; newPassword?: string }) =>
    api<PublicUser>('/auth/me', { method: 'PATCH', body: input }),
};

export interface TrialSignupInput {
  name: string;
  email: string;
  cpf: string;
  password: string;
  companyName: string;
  companyCnpj?: string;
  /** Aceite explícito dos Termos de Uso (checkbox não pré-marcado). */
  termsAccepted: boolean;
}

export const trialApi = {
  signup: (input: TrialSignupInput) => api<Session>('/trial/signup', { method: 'POST', body: input }),
};

export interface TicketListParams {
  status?: TicketStatus;
  platform?: string;
  assignedTo?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export const ticketsApi = {
  list: (params: TicketListParams) =>
    api<Paged<Ticket>>('/tickets', { query: params as Record<string, string | number | undefined> }),
  stats: () => api<TicketStats>('/tickets/stats'),
  metrics: (windowDays = 30) => api<TicketMetrics>('/tickets/metrics', { query: { windowDays } }),
  get: (id: string) => api<TicketDetail>(`/tickets/${id}`),
  create: (input: {
    lead: { name: string; phone?: string; email?: string; document?: string };
    message: string;
    vehicleText?: string;
    priority?: TicketPriority;
    extra?: Record<string, string>;
  }) => api<TicketDetail>('/tickets', { method: 'POST', body: input }),
  update: (id: string, patch: { status?: TicketStatus; priority?: TicketPriority; assignedToId?: string | null }) =>
    api<TicketDetail>(`/tickets/${id}`, { method: 'PATCH', body: patch }),
  addInteraction: (id: string, input: { type: 'AGENT_REPLY' | 'INTERNAL_NOTE'; body: string }) =>
    api<TicketDetail>(`/tickets/${id}/interactions`, { method: 'POST', body: input }),
  setBot: (id: string, enabled: boolean) =>
    api<TicketDetail>(`/tickets/${id}/bot`, { method: 'PATCH', body: { enabled } }),
};

export const usersApi = {
  list: () => api<UserListItem[]>('/users'),
  create: (input: { name: string; email: string; password: string; profileId?: string }) =>
    api<UserListItem>('/users', { method: 'POST', body: input }),
  update: (id: string, input: { name?: string; profileId?: string; active?: boolean; password?: string }) =>
    api<UserListItem>(`/users/${id}`, { method: 'PATCH', body: input }),
};

export interface ProfilePayload {
  name: string;
  description?: string;
  permissions: string[];
}

/** Perfis de acesso da loja (Administração › Perfis & Permissões). */
export const rolesApi = {
  list: () => api<AccessProfile[]>('/roles'),
  // o catálogo vem do servidor: é lá que a lista de permissões é definida
  catalog: () => api<PermissionCatalog>('/roles/catalog'),
  create: (input: ProfilePayload) => api<AccessProfile>('/roles', { method: 'POST', body: input }),
  update: (id: string, input: ProfilePayload) => api<AccessProfile>(`/roles/${id}`, { method: 'PUT', body: input }),
  remove: (id: string) => api<void>(`/roles/${id}`, { method: 'DELETE' }),
};

export interface VehicleListParams {
  brand?: string;
  model?: string;
  year?: number;
  status?: VehicleStatus;
  type?: VehicleType;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface VehiclePayload {
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
  status: VehicleStatus;
  optionals: string[];
  notes?: string | null;
  description?: string | null;
  showOnSite: boolean;
  featured: boolean;
}

export interface PlateLookupResult {
  plate: string;
  found: boolean;
  source: string;
  data: Partial<VehiclePayload> & { fipePrice?: number };
}

export const vehiclesApi = {
  list: (params: VehicleListParams) =>
    api<Paged<VehicleCard>>('/vehicles', { query: params as Record<string, string | number | undefined> }),
  facets: () => api<VehicleFacets>('/vehicles/facets'),
  get: (id: string) => api<VehicleDetail>(`/vehicles/${id}`),
  create: (payload: VehiclePayload) => api<VehicleDetail>('/vehicles', { method: 'POST', body: payload }),
  update: (id: string, payload: VehiclePayload) => api<VehicleDetail>(`/vehicles/${id}`, { method: 'PUT', body: payload }),
  remove: (id: string) => api<void>(`/vehicles/${id}`, { method: 'DELETE' }),
  plateLookup: (plate: string) => api<PlateLookupResult>('/vehicles/plate-lookup', { method: 'POST', body: { plate } }),
  addPhotos: (id: string, images: string[]) =>
    api<VehicleDetail>(`/vehicles/${id}/photos`, { method: 'POST', body: { images } }),
  reorderPhotos: (id: string, order: string[], coverId?: string) =>
    api<VehicleDetail>(`/vehicles/${id}/photos`, { method: 'PATCH', body: { order, coverId } }),
  deletePhoto: (id: string, photoId: string) =>
    api<VehicleDetail>(`/vehicles/${id}/photos/${photoId}`, { method: 'DELETE' }),
  addCost: (id: string, cost: { category: string; description: string; amount: number; incurredAt?: string }) =>
    api<VehicleDetail>(`/vehicles/${id}/costs`, { method: 'POST', body: cost }),
  deleteCost: (id: string, costId: string) =>
    api<VehicleDetail>(`/vehicles/${id}/costs/${costId}`, { method: 'DELETE' }),
  generateDescription: (id: string, extraNotes?: string) =>
    api<{ description: string }>(`/vehicles/${id}/description/generate`, { method: 'POST', body: { extraNotes } }),
};

export const integrationsApi = {
  list: () => api<Integration[]>('/integrations'),
  get: (platform: string) => api<IntegrationDetail>(`/integrations/${platform}`),
  connect: (platform: string, credentials: Record<string, string>) =>
    api<IntegrationDetail>(`/integrations/${platform}/connect`, { method: 'POST', body: { credentials } }),
  test: (platform: string) => api<IntegrationDetail>(`/integrations/${platform}/test`, { method: 'POST' }),
  setSync: (platform: string, syncEnabled: boolean) =>
    api<IntegrationDetail>(`/integrations/${platform}/sync`, { method: 'PATCH', body: { syncEnabled } }),
  disconnect: (platform: string) =>
    api<IntegrationDetail>(`/integrations/${platform}/disconnect`, { method: 'POST' }),
  // POST (e não GET) de propósito: o segredo não deve entrar em log de query
  // string, histórico do navegador nem cache intermediário.
  revealSecret: (platform: string) =>
    api<WebhookSecret>(`/integrations/${platform}/reveal-secret`, { method: 'POST' }),
  rotateSecret: (platform: string) =>
    api<WebhookSecret>(`/integrations/${platform}/rotate-secret`, { method: 'POST' }),
};

export interface CreditConsentInput {
  leadId: string;
  consentConfirmed: boolean;
  consentSource: string;
}

export const creditApi = {
  query: (document: string, consent: CreditConsentInput) =>
    api<CreditQuery>('/credit/queries', { method: 'POST', body: { document, ...consent } }),
  recent: () => api<CreditQuery[]>('/credit/queries/recent'),
  get: (id: string) => api<CreditQuery>(`/credit/queries/${id}`),
  link: (id: string, leadId: string) =>
    api<CreditQuery>(`/credit/queries/${id}/link`, { method: 'POST', body: { leadId } }),
};

export const leadsApi = {
  search: (search: string) =>
    api<LeadSearchResult[]>('/leads', { query: { search: search || undefined, limit: 10 } }),
};

export interface SubscribeInput {
  planCode: string;
  cycle: BillingCycle;
  method: BillingMethod;
  payer: {
    name: string;
    document: string;
    email: string;
    phone?: string;
    postalCode?: string;
    addressNumber?: string;
  };
}

export const billingApi = {
  overview: () => api<BillingOverview>('/billing/overview'),
  plans: () => api<BillingPlan[]>('/billing/plans'),
  payer: () => api<PayerDefaults>('/billing/payer'),
  subscribe: (input: SubscribeInput) =>
    api<SubscribeResult>('/billing/subscribe', { method: 'POST', body: input }),
  cancel: () => api<BillingSubscription | null>('/billing/cancel', { method: 'POST' }),
  /** Reconcilia com o gateway - o botão "já paguei e não apareceu". */
  sync: () => api<BillingCharge[]>('/billing/sync', { method: 'POST' }),
  pix: (chargeId: string) => api<ChargePix>(`/billing/charges/${chargeId}/pix`),
};

/**
 * Canais de atendimento do PRÓPRIO usuário (Meus Dados › Canais). Separado de
 * `integrationsApi` porque aquele exige ADMIN: aqui qualquer atendente conecta
 * o número dele.
 */
export const channelsApi = {
  platforms: () => api<ChannelPlatform[]>('/channels/platforms'),
  mine: () => api<UserChannel[]>('/channels'),
  senders: (platform: string) => api<ChannelSender[]>(`/channels/${platform}/senders`),
  connect: (platform: string, externalId: string) =>
    api<UserChannel>(`/channels/${platform}/connect`, { method: 'POST', body: { externalId } }),
  disconnect: (platform: string) => api<void>(`/channels/${platform}`, { method: 'DELETE' }),
};

export const storefrontApi = {
  get: () => api<StorefrontSettings>('/storefront'),
  save: (input: { slug?: string; published?: boolean; config?: StorefrontSettings['config'] }) =>
    api<StorefrontSettings>('/storefront', { method: 'PUT', body: input }),
  uploadImage: (kind: 'logo' | 'hero', image: string) =>
    api<{ kind: string; url: string }>('/storefront/images', { method: 'POST', body: { kind, image } }),
};

export const settingsApi = {
  getCompany: () => api<CompanySettings>('/settings/company'),
  saveCompany: (input: CompanySettings) => api<CompanySettings>('/settings/company', { method: 'PUT', body: input }),
  getLeadForm: () => api<LeadFormSettings>('/settings/lead-form'),
  saveLeadForm: (config: Record<string, { enabled: boolean; required: boolean }>) =>
    api<LeadFormSettings>('/settings/lead-form', { method: 'PUT', body: { config } }),
};

export interface FinanceListParams {
  type?: FinancialType;
  status?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const financeApi = {
  entries: (params: FinanceListParams) =>
    api<FinancialEntry[]>('/finance/entries', { query: params as Record<string, string | undefined> }),
  summary: () => api<FinanceSummary>('/finance/summary'),
  create: (input: {
    type: FinancialType;
    category: string;
    description: string;
    amount: number;
    dueDate: string;
    vehicleId?: string | null;
    paid?: boolean;
  }) => api<FinancialEntry>('/finance/entries', { method: 'POST', body: input }),
  setPaid: (id: string, paid: boolean) =>
    api<FinancialEntry>(`/finance/entries/${id}/paid`, { method: 'PATCH', body: { paid } }),
  remove: (id: string) => api<void>(`/finance/entries/${id}`, { method: 'DELETE' }),
};

export const fiscalApi = {
  invoices: (kind?: FiscalKind) =>
    api<FiscalInvoice[]>('/fiscal/invoices', { query: { kind } }),
  emit: (input: {
    kind: FiscalKind;
    vehicleId?: string | null;
    recipientName: string;
    recipientDoc?: string | null;
    operationValue: number;
  }) => api<FiscalInvoice>('/fiscal/invoices', { method: 'POST', body: input }),
  cancel: (id: string) => api<FiscalInvoice>(`/fiscal/invoices/${id}/cancel`, { method: 'POST' }),
};

export const agentApi = {
  getProfile: () => api<AgentProfileConfig>('/agent/profile'),
  saveProfile: (input: Partial<AgentProfileConfig>) =>
    api<AgentProfileConfig>('/agent/profile', { method: 'PUT', body: input }),

  listKnowledge: () =>
    api<{ docs: KnowledgeDoc[]; chars: number; budgetChars: number }>('/agent/knowledge'),
  createDoc: (input: { title: string; content: string; enabled?: boolean }) =>
    api<KnowledgeDoc>('/agent/knowledge', { method: 'POST', body: input }),
  updateDoc: (id: string, input: Partial<{ title: string; content: string; enabled: boolean }>) =>
    api<KnowledgeDoc>(`/agent/knowledge/${id}`, { method: 'PUT', body: input }),
  removeDoc: (id: string) => api<void>(`/agent/knowledge/${id}`, { method: 'DELETE' }),

  getFlow: () => api<FlowPolicyConfig>('/agent/flow'),
  saveFlow: (input: Partial<FlowPolicyConfig>) =>
    api<FlowPolicyConfig & { ticketsReprogramados: number }>('/agent/flow', { method: 'PUT', body: input }),
};

/** Módulo de Plataforma - só responde para a conta-plataforma (ver PLATFORM_ACCOUNT_ID). */
export const platformApi = {
  listAccounts: () => api<PlatformAccountOverview[]>('/platform/accounts'),
  getAccount: (id: string) => api<PlatformAccountDetail>(`/platform/accounts/${id}`),
  listActiveSessions: () => api<PlatformSupportSession[]>('/platform/support-sessions'),
  startSupportSession: (accountId: string, input: { reason?: string; durationMinutes?: number }) =>
    api<StartSupportSessionResult>(`/platform/accounts/${accountId}/support-sessions`, {
      method: 'POST',
      body: input,
    }),
  endSupportSession: (sessionId: string) =>
    api<void>(`/platform/support-sessions/${sessionId}/end`, { method: 'POST' }),
};

/** Chamado de DENTRO da conta do cliente (aba de suporte) - encerra a própria sessão. */
export const supportSessionApi = {
  endMine: () => api<void>('/support-session/end', { method: 'POST' }),
};
