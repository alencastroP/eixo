import { Router } from 'express';
import { env } from '../config/env';
import { ah, badRequest, notFound, unauthorized } from '../lib/errors';
import { decryptJson, isSealedSecret, type SealedSecret } from '../lib/crypto';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { findAdapter, listAdapters } from '../integrations';
import { isBlocked } from '../modules/billing/account.service';

export const webhookRouter = Router();

/**
 * Recepção de leads, isolada por conta: POST /webhooks/:platform/:webhookKey
 *
 * A `webhookKey` na URL diz DE QUAL LOJA é o lead; o segredo no header (ou a
 * assinatura HMAC do corpo) prova que o remetente é a plataforma. São papéis
 * separados de propósito — ver src/lib/webhook-key.ts.
 *
 * Responsabilidade mínima por design: autentica, carimba a conta e persiste o
 * payload BRUTO na fila (webhook_events), respondendo 202 imediatamente. A
 * normalização e a criação do ticket acontecem no worker, de forma assíncrona.
 *
 * Chave inexistente, plataforma trocada, conta bloqueada e segredo inválido
 * respondem TODOS 404 — um atacante com uma chave válida não deve conseguir
 * distinguir "conta suspensa" de "chave errada" nem enumerar contas.
 */
webhookRouter.post(
  '/webhooks/:platform/:webhookKey',
  ah(async (req, res) => {
    const slug = req.params.platform.toLowerCase();
    const adapter = findAdapter(slug);
    if (!adapter) throw notFound(`Plataforma não suportada: ${slug}`);

    const integration = await prisma.integration.findUnique({
      where: { webhookKey: req.params.webhookKey },
      select: {
        id: true,
        platform: true,
        accountId: true,
        syncEnabled: true,
        inboundSecret: true,
        account: { select: { status: true } },
      },
    });

    // A chave é de outra plataforma? Trata como inexistente: a chave identifica
    // uma integração específica, não a conta inteira.
    if (!integration || integration.platform !== slug) {
      logger.warn('webhook rejeitado: chave de roteamento desconhecida', { platform: slug });
      throw notFound('Endpoint de webhook não encontrado');
    }
    if (isBlocked(integration.account.status)) {
      logger.warn('webhook rejeitado: conta bloqueada', { platform: slug, accountId: integration.accountId });
      throw notFound('Endpoint de webhook não encontrado');
    }

    const secret = isSealedSecret(integration.inboundSecret)
      ? decryptJson<{ value: string }>(integration.inboundSecret as unknown as SealedSecret).value
      : '';

    const verification = adapter.verifyRequest(req, secret);
    if (!verification.ok) {
      // Segredo configurado e inválido → rejeita sempre. Não configurado →
      // rejeita em produção; em dev aceita com aviso para facilitar testes.
      if (verification.configured || env.isProd) {
        logger.warn('webhook rejeitado: falha de autenticação', {
          platform: slug,
          accountId: integration.accountId,
          reason: verification.reason,
        });
        throw unauthorized('Falha na verificação de autenticidade do webhook');
      }
      logger.warn('webhook aceito SEM verificação (segredo ausente — apenas dev)', {
        platform: slug,
        accountId: integration.accountId,
        reason: verification.reason,
      });
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw badRequest('Corpo JSON ausente ou inválido');
    }

    const event = await prisma.webhookEvent.create({
      data: { platform: slug, payload: req.body, accountId: integration.accountId },
    });

    // Log sem PII: apenas identificadores. O payload nunca é logado.
    logger.info('lead recebido e enfileirado', {
      platform: slug,
      eventId: event.id,
      accountId: integration.accountId,
    });
    res.status(202).json({ received: true, eventId: event.id });
  }),
);

/** Lista as plataformas suportadas (metadados públicos, sem segredo). */
webhookRouter.get('/webhooks/platforms', (_req, res) => {
  res.json(listAdapters().map((a) => ({ platform: a.platform, displayName: a.displayName })));
});
