/**
 * Desativa o usuário temporário de toda sessão de suporte vencida.
 * Agende como os demais scripts de manutenção (cron/Task Scheduler), a cada
 * 10 minutos: "cd /app/backend && node dist/scripts/expire-support-sessions.js"
 * Em dev: npm run expire-support-sessions
 */
import { prisma } from '../src/lib/prisma';
import { sweepExpiredSupportSessions } from '../src/modules/platform/platform.service';

sweepExpiredSupportSessions()
  .then((r) => {
    // eslint-disable-next-line no-console
    console.log('Sessões de suporte encerradas:', r.ended);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Falha ao varrer sessões de suporte:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
