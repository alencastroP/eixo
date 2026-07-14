import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Configurações persistidas como chave → JSON. Defaults abaixo garantem que a
 * primeira leitura funcione mesmo sem registro salvo.
 */

export interface CompanySettings {
  tradeName: string; // nome fantasia
  legalName: string; // razão social
  cnpj: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  logoUrl: string | null;
}

const DEFAULT_COMPANY: CompanySettings = {
  tradeName: 'Minha Loja de Veículos',
  legalName: '',
  cnpj: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  logoUrl: null,
};

/** Catálogo de campos opcionais do formulário de cadastro de leads/clientes. */
export const LEAD_FORM_FIELDS = [
  { key: 'document', label: 'CPF / CNPJ' },
  { key: 'birthDate', label: 'Data de Nascimento' },
  { key: 'maritalStatus', label: 'Estado Civil' },
  { key: 'profession', label: 'Profissão' },
  { key: 'motherName', label: 'Nome da Mãe' },
  { key: 'address', label: 'Endereço' },
] as const;

export type LeadFormFieldKey = (typeof LEAD_FORM_FIELDS)[number]['key'];
export type LeadFormConfig = Record<LeadFormFieldKey, { enabled: boolean; required: boolean }>;

const DEFAULT_LEAD_FORM: LeadFormConfig = {
  document: { enabled: true, required: false },
  birthDate: { enabled: false, required: false },
  maritalStatus: { enabled: false, required: false },
  profession: { enabled: false, required: false },
  motherName: { enabled: false, required: false },
  address: { enabled: false, required: false },
};

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row ? ({ ...fallback, ...(row.value as object) } as T) : fallback;
}

async function writeSetting<T>(key: string, value: T): Promise<T> {
  await prisma.setting.upsert({
    where: { key },
    update: { value: value as Prisma.InputJsonValue },
    create: { key, value: value as Prisma.InputJsonValue },
  });
  return value;
}

export const getCompany = () => readSetting('company', DEFAULT_COMPANY);
export const setCompany = (value: CompanySettings) => writeSetting('company', value);

export async function getLeadForm() {
  const config = await readSetting('leadForm', DEFAULT_LEAD_FORM);
  return { fields: LEAD_FORM_FIELDS, config };
}

/** Normaliza a config recebida contra o catálogo (ignora chaves desconhecidas). */
export async function setLeadForm(incoming: Partial<LeadFormConfig>) {
  const next = { ...DEFAULT_LEAD_FORM };
  for (const { key } of LEAD_FORM_FIELDS) {
    const v = incoming[key];
    if (v) next[key] = { enabled: Boolean(v.enabled), required: Boolean(v.enabled) && Boolean(v.required) };
  }
  await writeSetting('leadForm', next);
  return { fields: LEAD_FORM_FIELDS, config: next };
}
