/**
 * Cria (ou promove) um administrador real, sem as senhas de demonstração.
 *
 *   npm run create:admin -- admin@sualoja.com.br "Nome da Loja"
 *
 * Diferente de `npm run seed`, que existe para desenvolvimento e grava senhas
 * fixas e públicas (Admin@123), este script gera uma senha forte aleatória e a
 * imprime UMA ÚNICA VEZ, no terminal de quem executou — ela não fica em disco,
 * nem no banco em texto claro, nem no histórico do repositório.
 *
 * Idempotente: rodar de novo com o mesmo e-mail apenas redefine a senha.
 */
import { randomBytes } from 'node:crypto';
import { AccountStatus, SubscriptionStatus, UserRole } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/modules/auth/auth.service';
import { PLAN_SEED } from '../src/modules/billing/plans';

/** Senha aleatória legível para digitar uma vez e trocar depois, se quiser. */
function generatePassword(): string {
  // base64url sem caracteres ambíguos; ~192 bits de entropia
  return randomBytes(24).toString('base64url').replace(/[-_]/g, '');
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const accountName = process.argv[3]?.trim() || 'Minha Loja';

  if (!email || !email.includes('@')) {
    throw new Error('Uso: npm run create:admin -- <email> "<nome da loja>"');
  }

  // 1) catálogo de planos (idempotente)
  for (const p of PLAN_SEED) {
    await prisma.plan.upsert({ where: { code: p.code }, update: p, create: p });
  }
  const proPlan = await prisma.plan.findUniqueOrThrow({ where: { code: 'pro' } });

  // 2) conta (tenant). Reaproveita a primeira existente para não criar tenant
  //    duplicado em bases que já passaram pelo backfill.
  const existingAccount = await prisma.account.findFirst({ orderBy: { createdAt: 'asc' } });
  const account =
    existingAccount ??
    (await prisma.account.create({
      data: { name: accountName, status: AccountStatus.ACTIVE, planId: proPlan.id },
    }));

  await prisma.subscription.upsert({
    where: { accountId: account.id },
    update: {},
    create: { accountId: account.id, planId: proPlan.id, status: SubscriptionStatus.ACTIVE },
  });

  // 3) usuário admin
  const password = generatePassword();
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hashPassword(password), role: UserRole.ADMIN, active: true },
    create: {
      name: 'Administrador',
      email,
      passwordHash: hashPassword(password),
      role: UserRole.ADMIN,
      accountId: account.id,
    },
  });

  /* eslint-disable no-console */
  console.log('\n──────────────────────────────────────────────');
  console.log('  Administrador pronto');
  console.log('──────────────────────────────────────────────');
  console.log(`  Conta:   ${account.name} (${account.id})`);
  console.log(`  E-mail:  ${user.email}`);
  console.log(`  Senha:   ${password}`);
  console.log('──────────────────────────────────────────────');
  console.log('  Anote agora: esta senha não será exibida de novo.\n');
}

main()
  .catch((err) => {
    console.error('Falha ao criar administrador:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
