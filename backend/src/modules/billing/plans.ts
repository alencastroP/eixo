/**
 * Catálogo comercial - a fonte de verdade do que é vendido e por quanto.
 *
 * O que está aqui não é só preço: são os LIMITES que o resto do código cobra
 * (usuários, veículos, mensagens de IA por mês). O banco guarda o mesmo em
 * `plans`, semeado a partir daqui pelos scripts de backfill/instalação - a
 * tabela existe para a assinatura ter uma FK estável, não para ser editada à
 * mão.
 *
 * Duas decisões comerciais viraram estrutura e valem ser explícitas:
 *
 *  1. O ciclo ANUAL cobra 10 mensalidades (dois meses grátis). Antecipa caixa e
 *     derruba churn - e é o que justifica liberar boleto, que no mensal seria
 *     máquina de inadimplência.
 *  2. Todo plano pago tem COTA de mensagens de IA. O preço é flat, mas o custo
 *     de token não é: sem cota, uma loja de alto volume consome mais do que
 *     paga. A cota é medida em usage.service.ts e o excedente é bloqueado (o
 *     atendimento segue humano), nunca cobrado por surpresa.
 */
import { BillingCycle, BillingMethod } from '@prisma/client';

/** Limites e capacidades de um plano - o formato de `plans.features`. */
export interface PlanFeatures {
  maxUsers: number;
  maxVehicles: number;
  /** Mensagens do Agente de IA por mês. `null` = sem cota (uso interno). */
  aiMessagesPerMonth: number | null;
  /** Consultas de crédito incluídas por mês. `null` = sem cota. */
  creditQueriesPerMonth: number | null;
  /** Números de WhatsApp inclusos (extras viram add-on). */
  whatsappNumbers: number;
  modules: string[];
  prioritySupport?: boolean;
}

export interface PlanSeed {
  code: string;
  name: string;
  description: string;
  priceCents: number;
  /** Null = plano não vendido no ciclo anual (o trial). */
  priceYearlyCents: number | null;
  durationDays: number | null;
  features: PlanFeatures;
  sortOrder: number;
  highlight: boolean;
  active: boolean;
}

export const TRIAL_PLAN_CODE = 'trial';
export const TRIAL_DURATION_DAYS = 15;

/** Meses cobrados no ciclo anual - os outros 2 são o desconto. */
export const YEARLY_BILLED_MONTHS = 10;

/** Preço anual padrão a partir da mensalidade (10x = 2 meses grátis). */
export const yearlyFromMonthly = (monthlyCents: number) => monthlyCents * YEARLY_BILLED_MONTHS;

export const PLAN_SEED: PlanSeed[] = [
  {
    code: TRIAL_PLAN_CODE,
    name: 'Teste grátis',
    description: 'Quinze dias com o CRM inteiro aberto, sem cartão.',
    priceCents: 0,
    priceYearlyCents: null,
    durationDays: TRIAL_DURATION_DAYS,
    features: {
      maxUsers: 3,
      maxVehicles: 30,
      aiMessagesPerMonth: 300,
      creditQueriesPerMonth: 10,
      whatsappNumbers: 1,
      modules: ['tickets', 'vehicles', 'credit'],
    },
    sortOrder: 0,
    highlight: false,
    active: true,
  },
  {
    code: 'pro',
    name: 'Pro',
    description: 'Para a revenda que já vive dentro do sistema todo dia.',
    priceCents: 29900,
    priceYearlyCents: yearlyFromMonthly(29900),
    durationDays: null,
    features: {
      maxUsers: 15,
      maxVehicles: 500,
      aiMessagesPerMonth: 3000,
      creditQueriesPerMonth: 100,
      whatsappNumbers: 2,
      modules: ['all'],
    },
    sortOrder: 1,
    highlight: true,
    active: true,
  },
  {
    code: 'business',
    name: 'Business',
    description: 'Operação com várias lojas, volume alto e suporte prioritário.',
    priceCents: 79900,
    priceYearlyCents: yearlyFromMonthly(79900),
    durationDays: null,
    features: {
      maxUsers: 100,
      maxVehicles: 5000,
      aiMessagesPerMonth: 15000,
      creditQueriesPerMonth: 600,
      whatsappNumbers: 10,
      modules: ['all'],
      prioritySupport: true,
    },
    sortOrder: 2,
    highlight: false,
    active: true,
  },
];

const DEFAULT_FEATURES: PlanFeatures = {
  maxUsers: 1,
  maxVehicles: 10,
  aiMessagesPerMonth: 0,
  creditQueriesPerMonth: 0,
  whatsappNumbers: 1,
  modules: [],
};

/**
 * Lê `plans.features` (Json) como objeto tipado, tolerando linhas antigas que
 * não tenham todos os campos. Ninguém deve tocar no Json cru fora daqui.
 */
export function planFeatures(features: unknown): PlanFeatures {
  const raw = (features ?? {}) as Partial<PlanFeatures>;
  return {
    maxUsers: typeof raw.maxUsers === 'number' ? raw.maxUsers : DEFAULT_FEATURES.maxUsers,
    maxVehicles: typeof raw.maxVehicles === 'number' ? raw.maxVehicles : DEFAULT_FEATURES.maxVehicles,
    aiMessagesPerMonth: raw.aiMessagesPerMonth === null || typeof raw.aiMessagesPerMonth === 'number'
      ? raw.aiMessagesPerMonth
      : DEFAULT_FEATURES.aiMessagesPerMonth,
    creditQueriesPerMonth:
      raw.creditQueriesPerMonth === null || typeof raw.creditQueriesPerMonth === 'number'
        ? raw.creditQueriesPerMonth
        : DEFAULT_FEATURES.creditQueriesPerMonth,
    whatsappNumbers: typeof raw.whatsappNumbers === 'number' ? raw.whatsappNumbers : DEFAULT_FEATURES.whatsappNumbers,
    modules: Array.isArray(raw.modules) ? (raw.modules as string[]) : DEFAULT_FEATURES.modules,
    prioritySupport: raw.prioritySupport === true,
  };
}

/** Preço do plano no ciclo pedido, em centavos. */
export function priceFor(
  plan: { priceCents: number; priceYearlyCents: number | null },
  cycle: BillingCycle,
): number {
  if (cycle === BillingCycle.YEARLY) return plan.priceYearlyCents ?? yearlyFromMonthly(plan.priceCents);
  return plan.priceCents;
}

/**
 * Boleto só no ANUAL, por decisão comercial.
 *
 * Boleto mensal num SaaS deste tamanho não é uma forma de pagamento: é um
 * processo de cobrança manual todo mês, com inadimplência passiva embutida.
 * No anual o mesmo boleto é emitido uma vez e antecipa doze meses de caixa.
 */
export function isMethodAllowed(method: BillingMethod, cycle: BillingCycle): boolean {
  if (method === BillingMethod.BOLETO) return cycle === BillingCycle.YEARLY;
  return true;
}

/** Meios de pagamento oferecidos para um ciclo, na ordem em que a tela mostra. */
export function methodsFor(cycle: BillingCycle): BillingMethod[] {
  return [BillingMethod.CREDIT_CARD, BillingMethod.PIX, BillingMethod.BOLETO].filter((m) =>
    isMethodAllowed(m, cycle),
  );
}
