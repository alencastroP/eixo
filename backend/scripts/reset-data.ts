/**
 * Limpa TODOS os dados (mantém o schema) — uso exclusivo em desenvolvimento.
 * Rode `npm run seed` em seguida para repopular a demonstração.
 */
import { prisma } from '../src/lib/prisma';

async function main() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE ticket_interactions, audit_logs, webhook_events, tickets, leads, refresh_tokens, users RESTART IDENTITY CASCADE',
  );
  console.log('[reset-data] todas as tabelas de dados foram esvaziadas.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
