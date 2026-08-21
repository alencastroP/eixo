/**
 * Cria a conta-plataforma - a ÚNICA conta com acesso ao módulo de Plataforma
 * (visão de todas as contas + acesso de suporte). Uso único, na instalação.
 *
 *   npm run create:platform-account -- admin@exemplo.com
 *
 * Depois de rodar, copie o `accountId` impresso para PLATFORM_ACCOUNT_ID no
 * `.env` (local) e no dashboard do Render (produção) - sem essa variável
 * preenchida, NENHUM usuário desta conta acessa o módulo (ver config/env.ts).
 *
 * Idempotente: rodar de novo reaproveita a conta "Eixo — Plataforma" já
 * existente (não cria uma segunda) e só cria/atualiza o usuário pedido.
 */
import { randomBytes } from 'node:crypto';
import { AccountStatus, UserRole } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/modules/auth/auth.service';
import { adminProfileId } from '../src/modules/roles/roles.service';

const PLATFORM_ACCOUNT_NAME = 'Eixo — Plataforma';

function generatePassword(): string {
  return randomBytes(24).toString('base64url').replace(/[-_]/g, '');
}

function resolvePassword(): { password: string; generated: boolean } {
  const provided = process.env.ADMIN_PASSWORD;
  if (provided && provided.length > 0) {
    if (provided.length < 12) throw new Error('ADMIN_PASSWORD deve ter ao menos 12 caracteres.');
    return { password: provided, generated: false };
  }
  return { password: generatePassword(), generated: true };
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('Uso: npm run create:platform-account -- <email>');
  }

  const account =
    (await prisma.account.findFirst({ where: { name: PLATFORM_ACCOUNT_NAME } })) ??
    (await prisma.account.create({ data: { name: PLATFORM_ACCOUNT_NAME, status: AccountStatus.ACTIVE } }));

  const profileId = await adminProfileId(prisma, account.id);

  const { password, generated } = resolvePassword();
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hashPassword(password), role: UserRole.ADMIN, profileId, accountId: account.id, active: true },
    create: {
      name: 'Administrador da Plataforma',
      email,
      passwordHash: hashPassword(password),
      role: UserRole.ADMIN,
      profileId,
      accountId: account.id,
    },
  });

  /* eslint-disable no-console */
  console.log('\n──────────────────────────────────────────────');
  console.log('  Conta-plataforma pronta');
  console.log('──────────────────────────────────────────────');
  console.log(`  Conta:      ${account.name}`);
  console.log(`  accountId:  ${account.id}`);
  console.log('  ⚠ copie o accountId acima para PLATFORM_ACCOUNT_ID');
  console.log(`  E-mail:     ${user.email}`);
  if (generated) {
    console.log(`  Senha:      ${password}`);
    console.log('──────────────────────────────────────────────');
    console.log('  Anote agora: esta senha não será exibida de novo.\n');
  } else {
    console.log('  Senha:      (a que você definiu em ADMIN_PASSWORD)');
    console.log('──────────────────────────────────────────────\n');
  }
}

main()
  .catch((err) => {
    console.error('Falha ao criar conta-plataforma:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
