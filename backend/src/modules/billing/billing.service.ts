/**
 * Módulo de Pagamentos - o lado do produto.
 *
 * Regra que organiza o arquivo inteiro: **quem decide sobre dinheiro é o
 * gateway; aqui só espelhamos**. Este serviço monta a assinatura lá, guarda o
 * reflexo local para a tela abrir rápido, e espera o webhook dizer o que
 * aconteceu. Nada aqui marca cobrança como paga por conta própria.
 *
 * Consequência importante e deliberada: assinar NÃO libera acesso. Uma conta
 * expirada que cria a assinatura continua bloqueada até o `PAYMENT_CONFIRMED`
 * chegar (ver webhook.service.ts). Acesso é liberado por pagamento
 * confirmado, nunca por intenção de pagar.
 */
import {
  AccountStatus,
  BillingCycle,
  BillingMethod,
  ChargeStatus,
  SubscriptionStatus,
  type Account,
  type BillingCharge,
  type Plan,
  type Prisma,
  type Subscription,
} from '@prisma/client';
import { badRequest, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { onlyDigits, validateDocument } from '../../lib/document';
import { writeAudit } from '../audit/audit.service';
import { requireGateway, type GatewayCharge } from './gateway';
import { assertDowngradeFits, limitsOverview } from './limits.service';
import { isMethodAllowed, methodsFor, planFeatures, priceFor, TRIAL_PLAN_CODE } from './plans';
import { usageOverview } from './usage.service';

const DAY_MS = 86_400_000;

/** Boleto precisa de prazo entre a emissão e o vencimento para ser pagável. */
const BOLETO_LEAD_DAYS = 5;

// ─── Serialização para o front ───────────────────────────────────────────────

export function serializePlan(plan: Plan) {
  const features = planFeatures(plan.features);
  return {
    code: plan.code,
    name: plan.name,
    description: plan.description,
    priceCents: plan.priceCents,
    priceYearlyCents: plan.priceYearlyCents,
    highlight: plan.highlight,
    features,
    /** Ciclos em que o plano é vendido - o trial não é vendido em nenhum. */
    cycles: plan.priceYearlyCents === null ? [BillingCycle.MONTHLY] : [BillingCycle.MONTHLY, BillingCycle.YEARLY],
  };
}

export function serializeCharge(charge: BillingCharge) {
  return {
    id: charge.id,
    status: charge.status,
    method: charge.method,
    amountCents: charge.amountCents,
    description: charge.description,
    dueDate: charge.dueDate,
    paidAt: charge.paidAt,
    invoiceUrl: charge.invoiceUrl,
    bankSlipUrl: charge.bankSlipUrl,
    receiptUrl: charge.receiptUrl,
    nfseUrl: charge.nfseUrl,
    nfseStatus: charge.nfseStatus,
  };
}

function serializeSubscription(subscription: (Subscription & { plan: Plan }) | null) {
  if (!subscription) return null;
  return {
    status: subscription.status,
    planCode: subscription.plan.code,
    planName: subscription.plan.name,
    cycle: subscription.cycle,
    method: subscription.method,
    priceCents: subscription.priceCents,
    startedAt: subscription.startedAt,
    currentPeriodEnd: subscription.currentPeriodEnd,
    nextDueDate: subscription.nextDueDate,
    canceledAt: subscription.canceledAt,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    /** Só existe depois que uma cobrança em cartão foi paga. */
    card:
      subscription.cardLast4 && subscription.cardBrand
        ? { brand: subscription.cardBrand, last4: subscription.cardLast4, holder: subscription.cardHolder }
        : null,
    /** true = já existe contrato recorrente do lado do gateway. */
    connected: Boolean(subscription.externalSubscriptionId),
  };
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

export async function listPlans() {
  const plans = await prisma.plan.findMany({
    where: { active: true, code: { not: TRIAL_PLAN_CODE } },
    orderBy: { sortOrder: 'asc' },
  });
  return plans.map(serializePlan);
}

/**
 * Tudo que a tela de Pagamentos precisa, em uma chamada: plano vigente,
 * situação da conta, faturas, consumo e o catálogo para trocar de plano.
 */
export async function getOverview(accountId: string) {
  const [account, subscription, charges, usage, plans, limits] = await Promise.all([
    prisma.account.findUniqueOrThrow({ where: { id: accountId } }),
    prisma.subscription.findUnique({ where: { accountId }, include: { plan: true } }),
    prisma.billingCharge.findMany({
      where: { accountId },
      orderBy: { dueDate: 'desc' },
      take: 24,
    }),
    usageOverview(accountId),
    listPlans(),
    limitsOverview(accountId),
  ]);

  const gw = (await import('./gateway')).gateway();

  return {
    account: {
      status: account.status,
      trialEndsAt: account.trialEndsAt,
      billingName: account.billingName,
      billingEmail: account.billingEmail,
      billingDocument: account.cnpj,
      billingPhone: account.billingPhone,
    },
    subscription: serializeSubscription(subscription),
    charges: charges.map(serializeCharge),
    usage,
    /** Quanto do plano já está em uso (usuários, veículos, números). */
    limits,
    plans,
    /** Sem gateway configurado a tela abre em leitura, sem botões mentirosos. */
    gatewayEnabled: gw.enabled,
    methodsByCycle: {
      MONTHLY: methodsFor(BillingCycle.MONTHLY),
      YEARLY: methodsFor(BillingCycle.YEARLY),
    },
  };
}

// ─── Assinatura ──────────────────────────────────────────────────────────────

export interface SubscribeInput {
  planCode: string;
  cycle: BillingCycle;
  method: BillingMethod;
  /** Pagador. O documento é obrigatório: sem CPF/CNPJ o gateway não emite nada. */
  payer: {
    name: string;
    document: string;
    email: string;
    phone?: string | null;
    postalCode?: string | null;
    addressNumber?: string | null;
  };
}

/**
 * Primeiro vencimento.
 *
 * Durante o trial, a cobrança cai no dia seguinte ao término - o lojista
 * assina hoje e continua usando de graça o que já lhe foi prometido. Fora do
 * trial, cobra agora; o boleto ganha alguns dias de prazo porque é o único
 * meio que não se paga em segundos.
 */
function firstDueDate(account: Account, method: BillingMethod): Date {
  const now = new Date();
  const trialEnd = account.status === AccountStatus.TRIAL ? account.trialEndsAt : null;
  if (trialEnd && trialEnd.getTime() > now.getTime()) return new Date(trialEnd.getTime() + DAY_MS);
  if (method === BillingMethod.BOLETO) return new Date(now.getTime() + BOLETO_LEAD_DAYS * DAY_MS);
  return now;
}

/** Valida a entrada comercial antes de qualquer chamada de rede ao gateway. */
async function resolveTargetPlan(planCode: string, cycle: BillingCycle, method: BillingMethod) {
  if (planCode === TRIAL_PLAN_CODE) throw badRequest('O período de teste não é um plano contratável.');

  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan || !plan.active) throw notFound('Plano não encontrado ou indisponível.');
  if (cycle === BillingCycle.YEARLY && plan.priceYearlyCents === null) {
    throw badRequest('Este plano não é vendido no ciclo anual.');
  }
  if (!isMethodAllowed(method, cycle)) {
    throw badRequest(
      'Boleto está disponível apenas no plano anual. No mensal, use cartão de crédito ou PIX.',
      'METHOD_NOT_ALLOWED',
    );
  }
  return plan;
}

/**
 * Contrata ou troca o plano da conta.
 *
 * Idempotente do ponto de vista do gateway: se já existe assinatura lá, ela é
 * ATUALIZADA em vez de duplicada - criar uma segunda assinatura significaria
 * cobrar o mesmo cliente duas vezes por mês, que é o erro mais caro possível
 * neste módulo.
 */
export async function subscribe(accountId: string, actorId: string, input: SubscribeInput) {
  const gw = requireGateway();
  const plan = await resolveTargetPlan(input.planCode, input.cycle, input.method);

  const document = validateDocument(input.payer.document);
  if (!document) throw badRequest('CPF/CNPJ do pagador inválido.', 'INVALID_DOCUMENT');

  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  const existing = await prisma.subscription.findUnique({ where: { accountId } });
  const amountCents = priceFor(plan, input.cycle);

  // Downgrade só passa se a operação de hoje couber no plano de destino. Roda
  // ANTES de tocar no gateway: descobrir que não cabe depois de já ter alterado
  // o contrato recorrente deixaria a cobrança e o produto em desacordo.
  await assertDowngradeFits(accountId, planFeatures(plan.features));

  // 1) pagador no gateway (criado uma vez, reaproveitado sempre)
  const customerId = await gw.ensureCustomer(
    {
      accountRef: accountId,
      name: input.payer.name.trim(),
      cpfCnpj: document.digits,
      email: input.payer.email.trim().toLowerCase(),
      phone: input.payer.phone ? onlyDigits(input.payer.phone) : null,
      postalCode: input.payer.postalCode ? onlyDigits(input.payer.postalCode) : null,
      addressNumber: input.payer.addressNumber ?? null,
    },
    account.gatewayCustomerId,
  );

  // 2) contrato recorrente
  const description = `Eixo CRM - plano ${plan.name} (${input.cycle === BillingCycle.YEARLY ? 'anual' : 'mensal'})`;
  const remote = existing?.externalSubscriptionId
    ? await gw.updateSubscription(existing.externalSubscriptionId, {
        amountCents,
        cycle: input.cycle,
        method: input.method,
        description,
      })
    : await gw.createSubscription({
        customerId,
        accountRef: accountId,
        description,
        amountCents,
        cycle: input.cycle,
        method: input.method,
        firstDueDate: firstDueDate(account, input.method),
      });

  // 3) espelho local. O status da assinatura só vira ACTIVE quando o pagamento
  //    for confirmado; enquanto isso ela fica no estado que a conta já tem.
  const status =
    account.status === AccountStatus.TRIAL ? SubscriptionStatus.TRIALING : existing?.status ?? SubscriptionStatus.TRIALING;

  const saved = await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id: accountId },
      data: {
        gatewayCustomerId: customerId,
        planId: plan.id,
        billingName: input.payer.name.trim(),
        billingEmail: input.payer.email.trim().toLowerCase(),
        billingPhone: input.payer.phone ?? null,
        // O documento do pagador vira o CNPJ da conta quando ela ainda não tem
        // um - é o mesmo dado, e a loja não deveria digitá-lo duas vezes.
        ...(account.cnpj ? {} : { cnpj: document.digits }),
      },
    });

    const data = {
      planId: plan.id,
      cycle: input.cycle,
      method: input.method,
      priceCents: amountCents,
      gateway: gw.slug,
      externalSubscriptionId: remote.id,
      nextDueDate: remote.nextDueDate,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      status,
    } satisfies Prisma.SubscriptionUncheckedUpdateInput;

    const row = await tx.subscription.upsert({
      where: { accountId },
      update: data,
      create: { accountId, ...data },
      include: { plan: true },
    });

    await writeAudit(tx, {
      entityType: 'SUBSCRIPTION',
      entityId: row.id,
      action: existing?.externalSubscriptionId ? 'PLAN_CHANGED' : 'SUBSCRIBED',
      actorId,
      data: { planCode: plan.code, cycle: input.cycle, method: input.method, amountCents },
    });

    return row;
  });

  logger.info('assinatura contratada no gateway', {
    accountId,
    planCode: plan.code,
    cycle: input.cycle,
    method: input.method,
    gateway: gw.slug,
  });

  // 4) puxa as cobranças já emitidas - é delas que sai o link de pagamento
  const charges = await syncCharges(accountId);
  const open = charges.find((c) => c.status === ChargeStatus.PENDING || c.status === ChargeStatus.OVERDUE);

  return {
    subscription: serializeSubscription(saved),
    /** Página hospedada do gateway: é ali que o cartão é digitado, nunca aqui. */
    checkoutUrl: open?.invoiceUrl ?? null,
    charge: open ? serializeCharge(open) : null,
  };
}

/**
 * Cancelamento.
 *
 * O padrão é cancelar ao FIM do período já pago: o lojista pagou o mês, o mês
 * é dele. Cancelar na hora seria cobrar por um serviço que se corta no mesmo
 * dia - e gera pedido de estorno, que custa mais caro que o mês inteiro.
 */
export async function cancelSubscription(accountId: string, actorId: string) {
  const subscription = await prisma.subscription.findUnique({ where: { accountId }, include: { plan: true } });
  if (!subscription) throw notFound('Esta conta não possui assinatura ativa.');

  if (subscription.externalSubscriptionId) {
    const gw = requireGateway();
    await gw.cancelSubscription(subscription.externalSubscriptionId);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.subscription.update({
      where: { accountId },
      data: { cancelAtPeriodEnd: true, canceledAt: new Date() },
      include: { plan: true },
    });
    await writeAudit(tx, {
      entityType: 'SUBSCRIPTION',
      entityId: row.id,
      action: 'CANCEL_SCHEDULED',
      actorId,
      data: { planCode: row.plan.code, currentPeriodEnd: row.currentPeriodEnd },
    });
    return row;
  });

  logger.info('assinatura cancelada (efetiva ao fim do período pago)', {
    accountId,
    currentPeriodEnd: updated.currentPeriodEnd,
  });
  return serializeSubscription(updated);
}

// ─── Cobranças ───────────────────────────────────────────────────────────────

/** Grava/atualiza uma cobrança vinda do gateway. Chave: o id externo. */
export async function upsertCharge(
  accountId: string,
  charge: GatewayCharge,
  subscriptionId: string | null,
): Promise<BillingCharge> {
  const data = {
    accountId,
    subscriptionId,
    gateway: 'asaas',
    status: charge.status,
    method: charge.method,
    amountCents: charge.amountCents,
    description: charge.description,
    dueDate: charge.dueDate,
    paidAt: charge.paidAt,
    invoiceUrl: charge.invoiceUrl,
    bankSlipUrl: charge.bankSlipUrl,
    receiptUrl: charge.receiptUrl,
    ...(charge.nfseStatus ? { nfseStatus: charge.nfseStatus } : {}),
    ...(charge.nfseUrl ? { nfseUrl: charge.nfseUrl } : {}),
  };

  return prisma.billingCharge.upsert({
    where: { externalId: charge.externalId },
    update: data,
    create: { externalId: charge.externalId, ...data },
  });
}

/**
 * Reconcilia as cobranças da conta com o gateway.
 *
 * O webhook é o caminho normal; esta função é a rede de segurança para quando
 * um evento se perde (indisponibilidade nossa, deploy no meio da entrega). É
 * chamada ao assinar e pode ser chamada pela tela.
 */
export async function syncCharges(accountId: string): Promise<BillingCharge[]> {
  const subscription = await prisma.subscription.findUnique({ where: { accountId } });
  if (!subscription?.externalSubscriptionId) return [];

  const gw = requireGateway();
  const remote = await gw.listCharges(subscription.externalSubscriptionId);
  for (const charge of remote) {
    await upsertCharge(accountId, charge, subscription.id);
  }

  return prisma.billingCharge.findMany({ where: { accountId }, orderBy: { dueDate: 'desc' }, take: 24 });
}

/**
 * QR/copia-e-cola do PIX de uma cobrança.
 *
 * Buscado sob demanda, nunca guardado: o payload tem validade e pesaria como
 * base64 no banco para nada. O `accountId` no where é o isolamento - impede
 * que um id de cobrança de outra loja seja consultado por adivinhação.
 */
export async function getChargePix(accountId: string, chargeId: string) {
  const charge = await prisma.billingCharge.findFirst({ where: { id: chargeId, accountId } });
  if (!charge) throw notFound('Cobrança não encontrada.');

  const gw = requireGateway();
  const pix = await gw.getPix(charge.externalId);
  if (!pix) throw badRequest('Esta cobrança não possui PIX disponível.');
  return pix;
}

/** Dados do pagador já conhecidos, para pré-preencher o formulário. */
export async function getPayerDefaults(accountId: string) {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: {
      name: true,
      cnpj: true,
      billingName: true,
      billingEmail: true,
      billingPhone: true,
      users: {
        where: { role: 'ADMIN', active: true },
        select: { name: true, email: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  });

  const admin = account.users[0];
  return {
    name: account.billingName ?? account.name,
    document: account.cnpj ?? '',
    email: account.billingEmail ?? admin?.email ?? '',
    phone: account.billingPhone ?? '',
  };
}
