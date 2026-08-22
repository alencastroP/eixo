/**
 * Seleção do bureau ativo.
 *
 * A regra de degradação é deliberada e diferente da do gateway de pagamento:
 * quando o bureau configurado está sem credencial, aqui a consulta CAI NO MOCK
 * em vez de responder 503. Isso só é seguro porque o laudo carrega
 * `source: 'mock'` e a tela estampa "Resultado simulado, sem validade para
 * decisão de crédito" - a degradação é visível para quem lê o resultado.
 *
 * Sem essa marcação visível a queda para o mock seria inaceitável: laudo falso
 * silencioso é pior que erro.
 */
import { env } from '../../../config/env';
import { logger } from '../../../lib/logger';
import { assertivaProvider } from './assertiva.provider';
import { mockProvider } from './mock.provider';
import type { BureauProvider } from './types';

const REGISTRY: Record<string, BureauProvider> = {
  [assertivaProvider.slug]: assertivaProvider,
  [mockProvider.slug]: mockProvider,
};

/** Bureau efetivamente usado nas consultas desta instalação. */
export function bureau(): BureauProvider {
  const configured = REGISTRY[env.credit.provider];
  if (!configured) {
    logger.warn('bureau desconhecido em CREDIT_BUREAU_PROVIDER - usando o simulado', {
      provider: env.credit.provider,
    });
    return mockProvider;
  }
  if (!configured.enabled) return mockProvider;
  return configured;
}

/** true quando há bureau REAL configurado (nem mock, nem credencial faltando). */
export function bureauEnabled(): boolean {
  return bureau().slug !== 'mock';
}

export { generateReport } from './mock.provider';
export * from './types';
