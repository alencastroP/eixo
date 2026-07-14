/**
 * Expurgo de retenção (LGPD). Rode sob agendador (cron/Task Scheduler):
 *   npm run purge
 *
 * Ex.: cron diário às 3h → `0 3 * * * cd /app && node dist/scripts/purge.js`
 */
import { prisma } from '../src/lib/prisma';
import { runRetentionPurge } from '../src/lib/retention';

async function main() {
  const report = await runRetentionPurge();
  // eslint-disable-next-line no-console
  console.log('Expurgo concluído:', report);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Falha no expurgo:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
