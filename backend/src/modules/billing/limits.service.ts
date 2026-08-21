/**
 * Limites de plano - o que faz um plano ser diferente do outro na prática.
 *
 * Até aqui `plans.features` era decoração: os números existiam no catálogo, na
 * tela de preços e em lugar nenhum do código. Sem alguém cobrando, o Pro e o
 * Business entregam exatamente a mesma coisa - e ninguém faz upgrade de um
 * plano que já lhe dá tudo.
 *
 * Duas regras de conduta valem para tudo neste arquivo:
 *
 *  1. **Barrar na criação, nunca desligar o que já existe.** Estourar o teto
 *     impede cadastrar o próximo veículo; jamais some com veículo cadastrado,
 *     esconde usuário ativo ou corta acesso a dado que já é do lojista.
 *  2. **Erro que ensina.** A mensagem diz o número, o limite e o caminho
 *     ("15 de 15 usuários - o plano Business permite 100"). "Limite atingido"
 *     sozinho vira chamado de suporte, não upgrade.
 */
import { AccountStatus } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { planFeatures, type PlanFeatures } from './plans';

/** Estourou um limite do plano. 402 = "pague para continuar" - o front usa
 *  este status para abrir a tela de planos em vez de mostrar erro genérico. */
export class PlanLimitError extends AppError {
  constructor(
    message: string,
    public readonly limit: { resource: string; used: number; max: number },
  ) {
    super(402, message, 'PLAN_LIMIT_REACHED');
  }
}

export interface AccountPlanContext {
  accountId: string;
  planCode: string;
  planName: string;
  features: PlanFeatures;
  isTrial: boolean;
}

/**
 * Plano vigente da conta.
 *
 * Conta sem plano vinculado (base antiga, antes do SaaS) cai no catálogo mais
 * permissivo em vez de no mais restrito: um bug de vínculo não pode travar a
 * operação de quem já é cliente. Falta de plano é problema nosso, não dele.
 */
export async function planContext(accountId: string): Promise<AccountPlanContext | null> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { status: true, plan: { select: { code: true, name: true, features: true } } },
  });
  if (!account?.plan) return null;

  return {
    accountId,
    planCode: account.plan.code,
    planName: account.plan.name,
    features: planFeatures(account.plan.features),
    isTrial: account.status === AccountStatus.TRIAL,
  };
}

/** Sugere para onde subir quando o teto de um recurso é atingido. */
async function upgradeHint(resource: 'maxUsers' | 'maxVehicles', current: number): Promise<string> {
  const plans = await prisma.plan.findMany({
    where: { active: true, priceCents: { gt: 0 } },
    orderBy: { sortOrder: 'asc' },
    select: { name: true, features: true },
  });

  const better = plans.find((p) => {
    const value = planFeatures(p.features)[resource];
    return value > current;
  });

  if (!better) return 'Fale com o suporte para ampliar o limite.';
  const value = planFeatures(better.features)[resource];
  return `O plano ${better.name} permite ${value}.`;
}

/**
 * Barra a criação de usuário acima do teto do plano.
 *
 * Conta apenas usuários ATIVOS: quem foi desligado da loja não deveria ocupar
 * uma vaga paga, e desativar em vez de excluir é justamente o caminho correto
 * (preserva a autoria do histórico de atendimento).
 */
export async function assertCanAddUser(accountId: string): Promise<void> {
  const ctx = await planContext(accountId);
  if (!ctx) return;

  const used = await prisma.user.count({ where: { accountId, active: true } });
  if (used < ctx.features.maxUsers) return;

  const hint = await upgradeHint('maxUsers', ctx.features.maxUsers);
  throw new PlanLimitError(
    `Seu plano ${ctx.planName} inclui ${ctx.features.maxUsers} usuários ativos e todos estão em uso. ${hint}`,
    { resource: 'users', used, max: ctx.features.maxUsers },
  );
}

/**
 * Barra o cadastro de veículo acima do teto.
 *
 * Veículo VENDIDO não conta: o limite mede o tamanho da operação hoje, não o
 * histórico. Cobrar pelo que já foi vendido puniria justamente a loja que mais
 * usa o sistema, e a empurraria a apagar o próprio histórico para caber no
 * plano - o oposto do que o produto quer.
 */
export async function assertCanAddVehicle(accountId: string): Promise<void> {
  const ctx = await planContext(accountId);
  if (!ctx) return;

  const used = await prisma.vehicle.count({ where: { accountId, status: { not: 'SOLD' } } });
  if (used < ctx.features.maxVehicles) return;

  const hint = await upgradeHint('maxVehicles', ctx.features.maxVehicles);
  throw new PlanLimitError(
    `Seu plano ${ctx.planName} inclui ${ctx.features.maxVehicles} veículos em estoque e o limite foi atingido. ${hint}`,
    { resource: 'vehicles', used, max: ctx.features.maxVehicles },
  );
}

/**
 * Barra a conexão de mais números de WhatsApp que o plano inclui.
 *
 * É o limite mais fácil de estourar sem perceber: cada atendente conecta o
 * próprio número, e o custo por número é real do lado da Meta.
 */
export async function assertCanAddChannel(accountId: string): Promise<void> {
  const ctx = await planContext(accountId);
  if (!ctx) return;

  const used = await prisma.userChannel.count({ where: { accountId } });
  if (used < ctx.features.whatsappNumbers) return;

  throw new PlanLimitError(
    `Seu plano ${ctx.planName} inclui ${ctx.features.whatsappNumbers} número(s) de WhatsApp e todos já estão conectados. Desconecte um número ou mude de plano para conectar outro.`,
    { resource: 'whatsappNumbers', used, max: ctx.features.whatsappNumbers },
  );
}

/**
 * Módulo liberado no plano?
 *
 * `['all']` libera tudo - é como os planos pagos são semeados. A lista
 * explícita existe para o trial e para eventuais planos de entrada.
 */
export function planIncludesModule(features: PlanFeatures, moduleKey: string): boolean {
  return features.modules.includes('all') || features.modules.includes(moduleKey);
}

/** Consumo atual de cada limite - alimenta a tela de Pagamentos. */
export async function limitsOverview(accountId: string) {
  const ctx = await planContext(accountId);
  if (!ctx) return null;

  const [users, vehicles, channels] = await Promise.all([
    prisma.user.count({ where: { accountId, active: true } }),
    prisma.vehicle.count({ where: { accountId, status: { not: 'SOLD' } } }),
    prisma.userChannel.count({ where: { accountId } }),
  ]);

  return {
    planCode: ctx.planCode,
    planName: ctx.planName,
    items: [
      { resource: 'users', label: 'Usuários ativos', used: users, max: ctx.features.maxUsers },
      { resource: 'vehicles', label: 'Veículos em estoque', used: vehicles, max: ctx.features.maxVehicles },
      { resource: 'whatsappNumbers', label: 'Números de WhatsApp', used: channels, max: ctx.features.whatsappNumbers },
    ],
  };
}

/**
 * Downgrade só é possível quando o uso atual cabe no plano de destino.
 *
 * A alternativa - aceitar o downgrade e desativar o excedente - significaria
 * o sistema escolher SOZINHO quais dez usuários perdem acesso e quais
 * veículos somem da vitrine. Essa escolha é do lojista, e ele precisa
 * fazê-la antes, sabendo o que está fazendo (Termos, cl. 6.2).
 */
export async function assertDowngradeFits(accountId: string, targetFeatures: PlanFeatures): Promise<void> {
  const [users, vehicles, channels] = await Promise.all([
    prisma.user.count({ where: { accountId, active: true } }),
    prisma.vehicle.count({ where: { accountId, status: { not: 'SOLD' } } }),
    prisma.userChannel.count({ where: { accountId } }),
  ]);

  const blockers: string[] = [];
  if (users > targetFeatures.maxUsers) {
    blockers.push(`${users} usuários ativos (o plano permite ${targetFeatures.maxUsers})`);
  }
  if (vehicles > targetFeatures.maxVehicles) {
    blockers.push(`${vehicles} veículos em estoque (o plano permite ${targetFeatures.maxVehicles})`);
  }
  if (channels > targetFeatures.whatsappNumbers) {
    blockers.push(`${channels} números de WhatsApp (o plano permite ${targetFeatures.whatsappNumbers})`);
  }

  if (blockers.length > 0) {
    throw new AppError(
      409,
      `Sua operação hoje não cabe neste plano: ${blockers.join('; ')}. Ajuste antes de trocar - nada é removido automaticamente.`,
      'DOWNGRADE_BLOCKED',
    );
  }
}
