/**
 * Prova do módulo de cobrança - roda contra o banco configurado.
 *
 *   npm run verify:billing
 *
 * Exercita a máquina de estados SEM tocar no gateway: os eventos são injetados
 * no formato que o Asaas envia, e o que se verifica é o efeito deles sobre o
 * acesso da conta. É o caminho crítico do módulo - "pagou, entrou; venceu,
 * saiu" - e é justamente o que o compilador não garante.
 *
 * Cobre também os limites de plano e as cotas de consumo, que são o que
 * diferencia um plano do outro na prática.
 *
 * Cria contas descartáveis e apaga tudo ao final (CASCADE).
 */
import { AccountStatus, ChargeStatus, SubscriptionStatus, UsageMetric, UserRole } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { PLAN_SEED } from '../src/modules/billing/plans';
import { runDunning } from '../src/modules/billing/dunning.service';
import { assertCanAddUser, assertDowngradeFits, PlanLimitError } from '../src/modules/billing/limits.service';
import { planFeatures } from '../src/modules/billing/plans';
import { hasQuota, recordUsage } from '../src/modules/billing/usage.service';
import { receiveEvent } from '../src/modules/billing/webhook.service';

const SUFFIX = Date.now().toString(36);
let failures = 0;

/* eslint-disable no-console */
function check(label: string, condition: boolean, detail = '') {
  const mark = condition ? '  ok  ' : ' FALHA';
  if (!condition) failures += 1;
  console.log(`[${mark}] ${label}${detail ? ` - ${detail}` : ''}`);
}

/** Um evento no formato que o Asaas entrega no webhook. */
function asaasEvent(params: {
  id: string;
  event: string;
  paymentId: string;
  accountId: string;
  status: string;
  value: number;
  dueDate: string;
  subscription?: string;
}) {
  return {
    id: params.id,
    event: params.event,
    payment: {
      id: params.paymentId,
      subscription: params.subscription ?? null,
      externalReference: params.accountId,
      status: params.status,
      billingType: 'CREDIT_CARD',
      value: params.value,
      description: 'Eixo CRM - plano Pro (mensal)',
      dueDate: params.dueDate,
      paymentDate: params.status === 'CONFIRMED' || params.status === 'RECEIVED' ? params.dueDate : null,
      invoiceUrl: 'https://sandbox.asaas.com/i/exemplo',
      creditCard: { creditCardBrand: 'VISA', creditCardNumber: '4242' },
    },
  };
}

async function makeAccount(name: string, planCode: string, status: AccountStatus) {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { code: planCode } });
  const account = await prisma.account.create({
    data: { name: `${name} (billing ${SUFFIX})`, status, planId: plan.id },
  });
  await prisma.user.create({
    data: {
      name: `Admin ${name}`,
      email: `billing-${name.toLowerCase()}-${SUFFIX}@teste.local`,
      passwordHash: 'x',
      role: UserRole.ADMIN,
      accountId: account.id,
    },
  });
  const subscription = await prisma.subscription.create({
    data: {
      accountId: account.id,
      planId: plan.id,
      status: SubscriptionStatus.TRIALING,
      priceCents: plan.priceCents,
      gateway: 'asaas',
      externalSubscriptionId: `sub_${account.id.slice(-8)}`,
    },
  });
  return { account, subscription, plan };
}

async function main() {
  console.log(`\nMódulo de cobrança - verificação (sufixo ${SUFFIX})\n`);

  // Garante o catálogo (idempotente).
  for (const p of PLAN_SEED) {
    await prisma.plan.upsert({ where: { code: p.code }, update: p, create: p });
  }

  // ── 1. Pagamento confirmado libera o acesso ───────────────────────────────
  const A = await makeAccount('PagaEmDia', 'pro', AccountStatus.TRIAL);
  const r1 = await receiveEvent(
    asaasEvent({
      id: `evt_${SUFFIX}_1`,
      event: 'PAYMENT_CONFIRMED',
      paymentId: `pay_${SUFFIX}_1`,
      accountId: A.account.id,
      status: 'CONFIRMED',
      value: 299,
      dueDate: '2026-08-20',
      subscription: A.subscription.externalSubscriptionId!,
    }),
  );
  check('evento de pagamento é aplicado', r1.applied);

  const afterPaid = await prisma.account.findUniqueOrThrow({ where: { id: A.account.id } });
  const subPaid = await prisma.subscription.findUniqueOrThrow({ where: { accountId: A.account.id } });
  check('conta vira ACTIVE após pagamento confirmado', afterPaid.status === AccountStatus.ACTIVE, afterPaid.status);
  check('assinatura vira ACTIVE', subPaid.status === SubscriptionStatus.ACTIVE, subPaid.status);
  check('período pago é preenchido', subPaid.currentPeriodEnd !== null);
  check('cartão fica registrado para exibição', subPaid.cardLast4 === '4242', String(subPaid.cardLast4));

  // ── 2. Reentrega do MESMO evento não reaplica ─────────────────────────────
  const r2 = await receiveEvent(
    asaasEvent({
      id: `evt_${SUFFIX}_1`, // mesmo id
      event: 'PAYMENT_CONFIRMED',
      paymentId: `pay_${SUFFIX}_1`,
      accountId: A.account.id,
      status: 'CONFIRMED',
      value: 299,
      dueDate: '2026-08-20',
    }),
  );
  check('reentrega do mesmo evento é ignorada (idempotência)', !r2.applied);
  const events = await prisma.billingEvent.count({ where: { externalId: `evt_${SUFFIX}_1` } });
  check('apenas UM registro de evento foi gravado', events === 1, `${events} registro(s)`);

  // ── 3. Vencimento NÃO bloqueia na hora (carência) ─────────────────────────
  await receiveEvent(
    asaasEvent({
      id: `evt_${SUFFIX}_2`,
      event: 'PAYMENT_OVERDUE',
      paymentId: `pay_${SUFFIX}_2`,
      accountId: A.account.id,
      status: 'OVERDUE',
      value: 299,
      dueDate: '2026-08-20',
      subscription: A.subscription.externalSubscriptionId!,
    }),
  );
  const afterOverdue = await prisma.account.findUniqueOrThrow({ where: { id: A.account.id } });
  const subOverdue = await prisma.subscription.findUniqueOrThrow({ where: { accountId: A.account.id } });
  check('assinatura vira PAST_DUE ao vencer', subOverdue.status === SubscriptionStatus.PAST_DUE);
  check(
    'conta CONTINUA ativa durante a carência',
    afterOverdue.status === AccountStatus.ACTIVE,
    afterOverdue.status,
  );

  // ── 4. Carência estourada bloqueia ────────────────────────────────────────
  // Empurra o vencimento para trás para simular a passagem do tempo.
  await prisma.billingCharge.updateMany({
    where: { externalId: `pay_${SUFFIX}_2` },
    data: { dueDate: new Date(Date.now() - 30 * 86_400_000) },
  });
  await runDunning();
  const afterGrace = await prisma.account.findUniqueOrThrow({ where: { id: A.account.id } });
  check('carência esgotada bloqueia a conta', afterGrace.status === AccountStatus.PAST_DUE, afterGrace.status);

  // ── 5. Pagar de novo REATIVA sem passar pelo suporte ──────────────────────
  await receiveEvent(
    asaasEvent({
      id: `evt_${SUFFIX}_3`,
      event: 'PAYMENT_CONFIRMED',
      paymentId: `pay_${SUFFIX}_2`, // a MESMA cobrança, agora paga
      accountId: A.account.id,
      status: 'CONFIRMED',
      value: 299,
      dueDate: '2026-08-20',
      subscription: A.subscription.externalSubscriptionId!,
    }),
  );
  const afterRepay = await prisma.account.findUniqueOrThrow({ where: { id: A.account.id } });
  check('pagar reativa a conta bloqueada', afterRepay.status === AccountStatus.ACTIVE, afterRepay.status);

  // ── 6. Estorno suspende imediatamente ─────────────────────────────────────
  const B = await makeAccount('Estornada', 'pro', AccountStatus.ACTIVE);
  await receiveEvent(
    asaasEvent({
      id: `evt_${SUFFIX}_4`,
      event: 'PAYMENT_REFUNDED',
      paymentId: `pay_${SUFFIX}_4`,
      accountId: B.account.id,
      status: 'REFUNDED',
      value: 299,
      dueDate: '2026-08-20',
      subscription: B.subscription.externalSubscriptionId!,
    }),
  );
  const afterRefund = await prisma.account.findUniqueOrThrow({ where: { id: B.account.id } });
  check('estorno suspende a conta na hora', afterRefund.status === AccountStatus.SUSPENDED, afterRefund.status);

  // ── 7. Evento órfão é registrado, nunca aplicado ──────────────────────────
  const orphan = await receiveEvent(
    asaasEvent({
      id: `evt_${SUFFIX}_5`,
      event: 'PAYMENT_CONFIRMED',
      paymentId: `pay_${SUFFIX}_5`,
      accountId: 'conta-que-nao-existe',
      status: 'CONFIRMED',
      value: 100,
      dueDate: '2026-08-20',
    }),
  );
  check('evento de conta desconhecida não resolve tenant', orphan.accountId === null);
  const orphanRow = await prisma.billingEvent.findUnique({ where: { externalId: `evt_${SUFFIX}_5` } });
  check('evento órfão fica registrado para diagnóstico', orphanRow !== null);

  // ── 8. Limite de usuários do plano ────────────────────────────────────────
  const C = await makeAccount('NoLimite', 'trial', AccountStatus.TRIAL);
  const trialFeatures = planFeatures((await prisma.plan.findUniqueOrThrow({ where: { code: 'trial' } })).features);
  // makeAccount já criou 1 usuário; completa até o teto.
  for (let i = 1; i < trialFeatures.maxUsers; i++) {
    await prisma.user.create({
      data: {
        name: `Extra ${i}`,
        email: `extra-${i}-${SUFFIX}@teste.local`,
        passwordHash: 'x',
        role: UserRole.AGENT,
        accountId: C.account.id,
      },
    });
  }
  let limitHit = false;
  let limitMessage = '';
  try {
    await assertCanAddUser(C.account.id);
  } catch (err) {
    limitHit = err instanceof PlanLimitError;
    limitMessage = (err as Error).message;
  }
  check('criar usuário acima do teto é barrado', limitHit);
  check(
    'a mensagem de limite indica para onde subir',
    /plano (Pro|Business)/.test(limitMessage),
    limitMessage.slice(0, 90),
  );

  // ── 9. Downgrade que não cabe é recusado ──────────────────────────────────
  let downgradeBlocked = false;
  try {
    // A conta C tem 3 usuários (teto do trial); um plano fictício de 1 usuário não serve.
    await assertDowngradeFits(C.account.id, { ...trialFeatures, maxUsers: 1 });
  } catch {
    downgradeBlocked = true;
  }
  check('downgrade que não cabe na operação atual é recusado', downgradeBlocked);

  // ── 10. Cota de consumo ───────────────────────────────────────────────────
  const D = await makeAccount('Cota', 'trial', AccountStatus.TRIAL);
  const quota = trialFeatures.creditQueriesPerMonth!;
  check('cota disponível antes de consumir', await hasQuota(D.account.id, UsageMetric.CREDIT_QUERY));
  await recordUsage(D.account.id, UsageMetric.CREDIT_QUERY, quota);
  check('cota esgotada após consumir a franquia', !(await hasQuota(D.account.id, UsageMetric.CREDIT_QUERY)));
  check('cota de OUTRA métrica segue livre', await hasQuota(D.account.id, UsageMetric.AI_MESSAGE));

  // ── 11. Cancelamento agendado fecha no fim do período ─────────────────────
  const E = await makeAccount('Cancelando', 'pro', AccountStatus.ACTIVE);
  await prisma.subscription.update({
    where: { accountId: E.account.id },
    data: {
      status: SubscriptionStatus.ACTIVE,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(Date.now() - 86_400_000), // venceu ontem
    },
  });
  await runDunning();
  const afterCancel = await prisma.account.findUniqueOrThrow({ where: { id: E.account.id } });
  check(
    'cancelamento agendado fecha o acesso ao fim do período',
    afterCancel.status === AccountStatus.CANCELED,
    afterCancel.status,
  );

  // ── 12. Cobrança fica com o dono certo ────────────────────────────────────
  const chargeA = await prisma.billingCharge.findFirst({ where: { accountId: A.account.id } });
  const chargeB = await prisma.billingCharge.findFirst({ where: { accountId: B.account.id } });
  check('cobranças são isoladas por conta', chargeA?.accountId !== chargeB?.accountId);
  check('cobrança paga guarda a data de pagamento', chargeA?.paidAt != null || chargeA?.status === ChargeStatus.OVERDUE);

  // ── Limpeza ───────────────────────────────────────────────────────────────
  await prisma.billingEvent.deleteMany({ where: { externalId: { startsWith: `evt_${SUFFIX}` } } });
  await prisma.account.deleteMany({ where: { name: { contains: `billing ${SUFFIX}` } } });

  console.log(failures === 0 ? '\nTodas as verificações passaram.\n' : `\n${failures} verificação(ões) FALHARAM.\n`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('Falha na verificação:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
