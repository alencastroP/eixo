/**
 * Catálogo de planos (fonte de verdade para o seed/backfill).
 * `durationDays: 15` no trial é o período gratuito; planos pagos são recorrentes.
 */
export interface PlanSeed {
  code: string;
  name: string;
  priceCents: number;
  durationDays: number | null;
  features: Record<string, unknown>;
  active: boolean;
}

export const TRIAL_PLAN_CODE = 'trial';
export const TRIAL_DURATION_DAYS = 15;

export const PLAN_SEED: PlanSeed[] = [
  {
    code: TRIAL_PLAN_CODE,
    name: 'Teste grátis',
    priceCents: 0,
    durationDays: TRIAL_DURATION_DAYS,
    features: { maxUsers: 3, maxVehicles: 30, modules: ['tickets', 'vehicles', 'credit'] },
    active: true,
  },
  {
    code: 'pro',
    name: 'Pro',
    priceCents: 29900,
    durationDays: null,
    features: { maxUsers: 15, maxVehicles: 500, modules: ['all'] },
    active: true,
  },
  {
    code: 'business',
    name: 'Business',
    priceCents: 79900,
    durationDays: null,
    features: { maxUsers: 100, maxVehicles: 5000, modules: ['all'], prioritySupport: true },
    active: true,
  },
];
