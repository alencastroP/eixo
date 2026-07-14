import { Router } from 'express';
import { env } from '../config/env';
import { ah, badRequest, notFound, unauthorized } from '../lib/errors';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { findAdapter, listAdapters } from '../integrations';

export const webhookRouter = Router();

/**
 * Endpoint genérico de recepção de leads: POST /webhooks/:platform
 *
 * Responsabilidade mínima por design — autentica via adapter e persiste o
 * payload BRUTO na fila (webhook_events), respondendo 202 imediatamente.
 * Normalização/criação de ticket acontece no worker, de forma assíncrona:
 * pico de leads ou payload problemático nunca derruba a recepção nem perde dados.
 */
webhookRouter.post(
  '/webhooks/:platform',
  ah(async (req, res) => {
    const slug = req.params.platform.toLowerCase();
    const adapter = findAdapter(slug);
    if (!adapter) throw notFound(`Plataforma não suportada: ${slug}`);

    const verification = adapter.verifyRequest(req);
    if (!verification.ok) {
      // Segredo configurado e inválido → rejeita sempre. Não configurado →
      // rejeita em produção; em dev aceita com aviso para facilitar testes.
      if (verification.configured || env.isProd) {
        logger.warn('webhook rejeitado: falha de autenticação', { platform: slug, reason: verification.reason });
        throw unauthorized('Falha na verificação de autenticidade do webhook');
      }
      logger.warn('webhook aceito SEM verificação (segredo ausente — apenas dev)', {
        platform: slug,
        reason: verification.reason,
      });
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw badRequest('Corpo JSON ausente ou inválido');
    }

    const event = await prisma.webhookEvent.create({
      data: { platform: slug, payload: req.body },
    });

    // Log sem PII: apenas identificadores. O payload nunca é logado.
    logger.info('lead recebido e enfileirado', { platform: slug, eventId: event.id });
    res.status(202).json({ received: true, eventId: event.id });
  }),
);

/** Lista as plataformas suportadas (útil para diagnóstico). */
webhookRouter.get('/webhooks/platforms', (_req, res) => {
  res.json(listAdapters().map((a) => ({ platform: a.platform, displayName: a.displayName })));
});
