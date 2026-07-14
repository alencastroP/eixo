import { api, type Session } from './client';
import type {
  CompanySettings,
  CreditQuery,
  FinanceSummary,
  FinancialEntry,
  FinancialType,
  FiscalInvoice,
  FiscalKind,
  Integration,
  IntegrationDetail,
  LeadFormSettings,
  LeadSearchResult,
  Paged,
  PublicUser,
  Ticket,
  TicketDetail,
  TicketMetrics,
  TicketPriority,
  TicketStats,
  TicketStatus,
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
  create: (input: { name: string; email: string; password: string; role: 'ADMIN' | 'AGENT' }) =>
    api<UserListItem>('/users', { method: 'POST', body: input }),
  update: (id: string, input: { name?: string; role?: 'ADMIN' | 'AGENT'; active?: boolean; password?: string }) =>
    api<UserListItem>(`/users/${id}`, { method: 'PATCH', body: input }),
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
};

export const creditApi = {
  query: (document: string) => api<CreditQuery>('/credit/queries', { method: 'POST', body: { document } }),
  recent: () => api<CreditQuery[]>('/credit/queries/recent'),
  get: (id: string) => api<CreditQuery>(`/credit/queries/${id}`),
  link: (id: string, leadId: string) =>
    api<CreditQuery>(`/credit/queries/${id}/link`, { method: 'POST', body: { leadId } }),
};

export const leadsApi = {
  search: (search: string) =>
    api<LeadSearchResult[]>('/leads', { query: { search: search || undefined, limit: 10 } }),
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
