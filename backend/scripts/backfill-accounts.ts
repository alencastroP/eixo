/**
 * Backfill SaaS (idempotente). Roda uma vez após a migração de contas:
 *   npm run backfill:accounts
 *
 * - Semeia o catálogo de planos (trial/pro/business).
 * - Cria uma conta "default" (ACTIVE) para abrigar os dados pré-SaaS.
 * - Vincula todo usuário sem accountId a essa conta.
 * - Garante uma assinatura ativa para a conta default.
 */
import { AccountStatus, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { PLAN_SEED } from '../src/modules/billing/plans';

async function main() {
  // 1) planos
  for (const p of PLAN_SEED) {
    await prisma.plan.upsert({ where: { code: p.code }, update: p, create: p });
  }
  const proPlan = await prisma.plan.findUniqueOrThrow({ where: { code: 'pro' } });

  // 2) conta default para os dados existentes
  const existing = await prisma.account.findFirst({ where: { name: 'Conta Demonstração' } });
  const account =
    existing ??
    (await prisma.account.create({
      data: {
        name: 'Conta Demonstração',
        status: AccountStatus.ACTIVE,
        planId: proPlan.id,
      },
    }));

  // 3) vincula usuários órfãos
  const linked = await prisma.user.updateMany({
    where: { accountId: null },
    data: { accountId: account.id },
  });

  // 4) assinatura da conta default
  await prisma.subscription.upsert({
    where: { accountId: account.id },
    update: {},
    create: { accountId: account.id, planId: proPlan.id, status: SubscriptionStatus.ACTIVE },
  });

  // eslint-disable-next-line no-console
  console.log(`Backfill concluído: conta=${account.id}, usuários vinculados=${linked.count}`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Falha no backfill:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
