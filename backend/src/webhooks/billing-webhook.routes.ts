import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';
import { ah } from '../lib/errors';
import { logger } from '../lib/logger';
import { receiveEvent } from '../modules/billing/webhook.service';

/**
 * Recepção dos eventos do gateway de pagamento.
 *
 *   POST /webhooks/billing
 *
 * Mora no serviço de webhooks (processo separado da API) pelo mesmo motivo dos
 * leads: é um endpoint público, chamado por terceiro, e não deve competir por
 * recursos com o CRM que o lojista está usando.
 *
 * Diferença em relação ao webhook de leads: aqui o processamento é SÍNCRONO,
 * não enfileirado. O volume é baixo (algumas cobranças por conta por mês) e o
 * efeito - liberar ou bloquear o acesso de uma loja inteira - precisa valer no
 * instante em que o pagamento é confirmado, não quando um worker acordar.
 *
 * A idempotência não depende deste arquivo: ela está na constraint única de
 * `billing_events.externalId` (ver webhook.service.ts).
 */
export const billingWebhookRouter = Router();

/**
 * Compara o token em tempo constante.
 *
 * `a === b` em segredo vaza o tamanho do prefixo comum pelo tempo de resposta.
 * Num endpoint público que qualquer um pode chamar em volume, isso é
 * suficiente para descobrir o token caractere a caractere.
 */
function tokenMatches(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

billingWebhookRouter.post(
  '/billing',
  ah(async (req, res) => {
    const expected = env.billing.asaas.webhookToken;

    // Sem token configurado o endpoint fica FECHADO. A alternativa - aceitar
    // qualquer chamada quando não há segredo - deixaria qualquer pessoa na
    // internet marcar contas como pagas.
    if (!expected) {
      logger.error('billing: webhook recebido sem ASAAS_WEBHOOK_TOKEN configurado - rejeitado');
      res.status(404).json({ error: { message: 'Endpoint não encontrado' } });
      return;
    }

    const received = req.get('asaas-access-token') ?? '';
    if (!tokenMatches(received, expected)) {
      logger.warn('billing: webhook rejeitado - token inválido');
      // 404 e não 401: não confirmamos sequer que o endpoint existe para quem
      // não tem o segredo.
      res.status(404).json({ error: { message: 'Endpoint não encontrado' } });
      return;
    }

    const result = await receiveEvent(req.body);

    // Sempre 200 quando o token é válido, inclusive para evento repetido ou que
    // falhou ao aplicar. Devolver erro faria o gateway reentregar, e a
    // reentrega bate na idempotência sem nunca reprocessar - o que recupera de
    // falha é a reconciliação, não a insistência do gateway.
    res.json({ received: true, applied: result.applied });
  }),
);
