/**
 * Ciclo de billing - a parte do módulo que só o tempo dispara.
 *
 * Agende DIARIAMENTE (cron/Task Scheduler):
 *   0 6 * * *  cd /app/backend && node dist/scripts/billing-cycle.js
 * Em dev: npm run billing:cycle
 *
 * Roda três coisas, nesta ordem, porque uma alimenta a outra:
 *
 *  1. **Reconciliação** - pergunta ao gateway o que aconteceu, cobrindo webhook
 *     perdido. Vem primeiro para que o estado esteja correto ANTES de qualquer
 *     decisão de bloqueio: bloquear quem pagou, por um evento que se perdeu, é
 *     o pior erro que este módulo pode cometer.
 *  2. **Régua de inadimplência** - bloqueia quem passou da carência, efetiva
 *     cancelamentos agendados.
 *  3. **Expiração de trials** - o que já existia.
 *
 * Falha em uma etapa não impede as outras: são independentes, e uma
 * indisponibilidade do gateway não pode travar a expiração dos trials.
 */
import { prisma } from '../src/lib/prisma';
import { runDunning } from '../src/modules/billing/dunning.service';
import { runTrialExpiry } from '../src/modules/billing/expiry.service';
import { runReconciliation } from '../src/modules/billing/reconcile.service';

/* eslint-disable no-console */
async function step<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    const result = await fn();
    console.log(`[ok] ${label}:`, result);
    return result;
  } catch (err) {
    console.error(`[FALHA] ${label}:`, err);
    process.exitCode = 1;
    return null;
  }
}

async function main() {
  console.log('\nCiclo de billing -', new Date().toISOString(), '\n');
  await step('reconciliação com o gateway', () => runReconciliation());
  await step('régua de inadimplência', () => runDunning());
  await step('expiração de trials', () => runTrialExpiry());
}

main()
  .catch((err) => {
    console.error('Falha no ciclo de billing:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
