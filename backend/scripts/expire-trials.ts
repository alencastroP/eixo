/**
 * Expiração de trials (LGPD-safe: bloqueia acesso, preserva dados).
 * Agende diariamente (cron/Task Scheduler):
 *   0 * * * *  cd /app/backend && node dist/scripts/expire-trials.js   # de hora em hora
 * Em dev: npm run expire-trials
 */
import { prisma } from '../src/lib/prisma';
import { runTrialExpiry } from '../src/modules/billing/expiry.service';

runTrialExpiry()
  .then((r) => {
    // eslint-disable-next-line no-console
    console.log('Expiração concluída:', r);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Falha na expiração de trials:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
