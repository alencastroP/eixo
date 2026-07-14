import type { Request } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { AdapterPayloadError, type LeadSourceAdapter, type NormalizedLead, type VerifyResult } from '../core/types';
import { normalizePhone, safeEqual } from '../core/verify';

/**
 * Adapter Webmotors (mock estruturado — API real exige credenciamento de lojista).
 * Payload em PascalCase, como as APIs .NET da Webmotors/Santander.
 * Autenticação: token compartilhado no header `x-webmotors-token`.
 * Payload de exemplo: backend/samples/webmotors-lead.json
 */
const webmotorsPayloadSchema = z
  .object({
    ProposalId: z.union([z.string(), z.number()]).transform(String).optional(),
    Name: z.string().min(1),
    Email: z.string().email().nullish(),
    Phone: z.union([z.string(), z.number()]).transform(String).nullish(),
    Message: z.string().nullish(),
    Vehicle: z
      .object({
        UniqueId: z.union([z.string(), z.number()]).transform(String).optional(),
        Make: z.string().optional(),
        Model: z.string().optional(),
        Version: z.string().optional(),
        YearFabrication: z.number().optional(),
        Price: z.number().optional(),
        Url: z.string().optional(),
      })
      .passthrough()
      .nullish(),
    MediaSource: z.string().nullish(),
    CreatedDate: z.string().optional(),
  })
  .passthrough();

export const webmotorsAdapter: LeadSourceAdapter = {
  platform: 'webmotors',
  displayName: 'Webmotors',
  description: 'Integre os leads dos seus anúncios na Webmotors ao seu funil de atendimento.',
  docsUrl: 'https://www.webmotors.com.br/',
  supportsOutbound: false,
  credentialFields: [
    { key: 'dealerId', label: 'ID do Lojista', type: 'text', placeholder: 'ex.: 45210', required: true },
    {
      key: 'apiToken',
      label: 'Token de API',
      type: 'password',
      placeholder: 'seu token',
      help: 'Fornecido pela Webmotors no credenciamento de lojista.',
      required: true,
    },
  ],

  verifyRequest(req: Request): VerifyResult {
    const secret = env.integrations.webmotorsWebhookToken;
    if (!secret) return { ok: false, configured: false, reason: 'WEBMOTORS_WEBHOOK_TOKEN não configurado' };
    const token = req.header('x-webmotors-token');
    if (token && safeEqual(token, secret)) return { ok: true };
    return { ok: false, configured: true, reason: 'header x-webmotors-token ausente ou inválido' };
  },

  normalize(payload: unknown): NormalizedLead {
    const parsed = webmotorsPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new AdapterPayloadError('webmotors', 'payload de lead inesperado', parsed.error.issues);
    }
    const data = parsed.data;
    const vehicleTitle = data.Vehicle
      ? [data.Vehicle.Make, data.Vehicle.Model, data.Vehicle.Version, data.Vehicle.YearFabrication]
          .filter(Boolean)
          .join(' ')
      : undefined;
    return {
      externalLeadId: data.ProposalId,
      name: data.Name,
      phone: normalizePhone(data.Phone),
      email: data.Email?.toLowerCase() ?? undefined,
      message: data.Message?.trim() || 'Interessado no anúncio (sem mensagem).',
      vehicle: data.Vehicle
        ? {
            externalId: data.Vehicle.UniqueId,
            title: vehicleTitle || undefined,
            price: data.Vehicle.Price,
            url: data.Vehicle.Url,
          }
        : undefined,
      campaign: data.MediaSource ?? undefined,
      platformReceivedAt: data.CreatedDate,
    };
  },
};
