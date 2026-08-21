/**
 * Seleção do gateway ativo.
 *
 * Um só, bem integrado - dois gateways no início multiplicam a superfície de
 * reconciliação (dois webhooks, dois modelos de estado, duas réguas de
 * inadimplência) sem entregar nada ao lojista. O registro existe para que a
 * troca seja uma linha de env no dia em que fizer sentido, não para rodar
 * vários ao mesmo tempo.
 */
import { AppError } from '../../../lib/errors';
import { env } from '../../../config/env';
import { asaasGateway } from './asaas.gateway';
import type { PaymentGateway } from './types';

const REGISTRY: Record<string, PaymentGateway> = {
  [asaasGateway.slug]: asaasGateway,
};

/** Gateway configurado nesta instalação. */
export function gateway(): PaymentGateway {
  return REGISTRY[env.billing.provider] ?? asaasGateway;
}

/**
 * Gateway configurado E com credencial - ou 503 explicando.
 *
 * Toda rota que MOVE dinheiro passa por aqui. Falhar cedo, com mensagem clara,
 * é melhor do que descobrir a credencial ausente no meio de uma assinatura,
 * com o cliente olhando para a tela.
 */
export function requireGateway(): PaymentGateway {
  const gw = gateway();
  if (!gw.enabled) {
    throw new AppError(
      503,
      'Pagamentos ainda não estão habilitados nesta instalação. Fale com o suporte.',
      'BILLING_UNAVAILABLE',
    );
  }
  return gw;
}

export * from './types';
