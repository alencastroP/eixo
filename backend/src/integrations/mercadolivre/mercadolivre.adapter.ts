import type { Request } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { AdapterPayloadError, type LeadSourceAdapter, type NormalizedLead, type VerifyResult } from '../core/types';
import { hmacSha256Hex, normalizePhone, safeEqual } from '../core/verify';

/**
 * Adapter Mercado Livre (mock estruturado).
 *
 * Na integração oficial, o ML envia notificações "magras" (topic + resource) e a
 * aplicação busca o recurso completo na API autenticada. Aqui, sem credenciais de
 * parceiro, o mock recebe o lead completo no corpo — a troca futura acontece só
 * dentro deste adapter, sem tocar no core.
 *
 * Autenticação: HMAC-SHA256 do corpo bruto no header `x-signature`
 * (env MERCADOLIVRE_WEBHOOK_SECRET). Payload de exemplo: backend/samples/mercadolivre-lead.json
 */
const mlPayloadSchema = z
  .object({
    lead_id: z.union([z.string(), z.number()]).transform(String).optional(),
    date_created: z.string().optional(),
    buyer: z
      .object({
        name: z.string().min(1),
        email: z.string().email().nullish(),
        phone: z
          .union([
            z.string(),
            z.object({ area_code: z.union([z.string(), z.number()]).nullish(), number: z.union([z.string(), z.number()]).nullish() }),
          ])
          .nullish(),
      })
      .passthrough(),
    item: z
      .object({
        id: z.union([z.string(), z.number()]).transform(String).optional(),
        title: z.string().optional(),
        price: z.number().optional(),
        permalink: z.string().optional(),
      })
      .passthrough()
      .nullish(),
    message: z.string().nullish(),
    campaign: z.string().nullish(),
  })
  .passthrough();

function extractPhone(phone: z.infer<typeof mlPayloadSchema>['buyer']['phone']): string | undefined {
  if (!phone) return undefined;
  if (typeof phone === 'string') return normalizePhone(phone);
  const joined = `${phone.area_code ?? ''}${phone.number ?? ''}`;
  return normalizePhone(joined);
}

export const mercadoLivreAdapter: LeadSourceAdapter = {
  platform: 'mercadolivre',
  displayName: 'Mercado Livre',
  description: 'Receba perguntas e leads dos seus veículos anunciados no Mercado Livre.',
  docsUrl: 'https://developers.mercadolivre.com.br/',
  supportsOutbound: false,
  credentialFields: [
    { key: 'appId', label: 'App ID', type: 'text', placeholder: '1234567890', required: true },
    {
      key: 'secretKey',
      label: 'Secret Key',
      type: 'password',
      placeholder: 'sua secret key',
      help: 'Credenciais da sua aplicação no Mercado Livre Developers.',
      required: true,
    },
  ],

  verifyRequest(req: Request): VerifyResult {
    const secret = env.integrations.mercadoLivreWebhookSecret;
    if (!secret) return { ok: false, configured: false, reason: 'MERCADOLIVRE_WEBHOOK_SECRET não configurado' };
    const signature = req.header('x-signature');
    if (!signature) return { ok: false, configured: true, reason: 'header x-signature ausente' };
    if (!req.rawBody) return { ok: false, configured: true, reason: 'corpo bruto indisponível para verificação HMAC' };
    const expected = hmacSha256Hex(secret, req.rawBody);
    return safeEqual(signature, expected)
      ? { ok: true }
      : { ok: false, configured: true, reason: 'assinatura HMAC inválida' };
  },

  normalize(payload: unknown): NormalizedLead {
    const parsed = mlPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new AdapterPayloadError('mercadolivre', 'payload de lead inesperado', parsed.error.issues);
    }
    const data = parsed.data;
    return {
      externalLeadId: data.lead_id,
      name: data.buyer.name,
      phone: extractPhone(data.buyer.phone),
      email: data.buyer.email?.toLowerCase() ?? undefined,
      message: data.message?.trim() || 'Interessado no anúncio (sem mensagem).',
      vehicle: data.item
        ? {
            externalId: data.item.id,
            title: data.item.title,
            price: data.item.price,
            url: data.item.permalink,
          }
        : undefined,
      campaign: data.campaign ?? undefined,
      platformReceivedAt: data.date_created,
    };
  },
};
