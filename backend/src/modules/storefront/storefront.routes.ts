import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/permissions';
import { ah } from '../../lib/errors';
import { saveImageDataUrl } from '../../lib/storage';
import * as storefront from './storefront.service';

/**
 * Configuração da vitrine, dentro do CRM. Montada sob o guard de tenant -
 * a conta vem de `req.account`, nunca do corpo da requisição.
 * Leitura para quem tem acesso à conta; escrita só com 'storefront.manage'.
 */
export const storefrontRouter = Router();

storefrontRouter.get(
  '/',
  ah(async (req, res) => {
    res.json(await storefront.getOrCreateStorefront(req.account!.id));
  }),
);

const brandSchema = z.object({
  name: z.string().trim().max(60).default(''),
  tagline: z.string().trim().max(120).default(''),
  logoUrl: z.string().nullable().default(null),
  primary: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida (use hexadecimal, ex.: #ff6b35)')
    .default('#ff6b35'),
  theme: z.enum(['dark', 'light']).default('dark'),
  showName: z.boolean().default(true),
});

const heroSchema = z.object({
  title: z.string().trim().max(120).default(''),
  subtitle: z.string().trim().max(280).default(''),
  imageUrl: z.string().nullable().default(null),
  ctaPrimary: z.string().trim().max(40).default('Ver estoque'),
  ctaSecondary: z.string().trim().max(40).default(''),
  badges: z.array(z.string().trim().max(60)).max(4).default([]),
});

const contactSchema = z.object({
  phone: z.string().trim().max(40).default(''),
  whatsapp: z.string().trim().max(20).default(''),
  email: z.string().trim().max(120).default(''),
  address: z.string().trim().max(200).default(''),
  city: z.string().trim().max(80).default(''),
  state: z.string().trim().max(2).default(''),
  hours: z.string().trim().max(160).default(''),
  mapUrl: z.string().trim().max(500).default(''),
  instagram: z.string().trim().max(120).default(''),
  facebook: z.string().trim().max(120).default(''),
});

const configSchema = z.object({
  brand: brandSchema,
  hero: heroSchema,
  highlights: z
    .array(
      z.object({
        icon: z.string().trim().max(20).default('shield'),
        title: z.string().trim().max(60).default(''),
        text: z.string().trim().max(240).default(''),
      }),
    )
    .max(6)
    .default([]),
  about: z.object({ title: z.string().trim().max(80).default(''), text: z.string().trim().max(2000).default('') }),
  contact: contactSchema,
  financing: z.object({
    downPercent: z.coerce.number().min(0).max(90).default(20),
    months: z.coerce.number().int().min(6).max(72).default(48),
    monthlyRate: z.coerce.number().min(0).max(10).default(1.99),
  }),
  sections: z.object({
    featured: z.boolean().default(true),
    inventory: z.boolean().default(true),
    highlights: z.boolean().default(true),
    financing: z.boolean().default(true),
    sell: z.boolean().default(true),
    about: z.boolean().default(true),
    contact: z.boolean().default(true),
  }),
  seo: z.object({ title: z.string().trim().max(70).default(''), description: z.string().trim().max(180).default('') }),
});

const updateSchema = z.object({
  slug: z.string().trim().min(3).max(40).optional(),
  published: z.boolean().optional(),
  config: configSchema.optional(),
});

storefrontRouter.put(
  '/',
  requirePermission('storefront.manage'),
  ah(async (req, res) => {
    res.json(await storefront.updateStorefront(req.account!.id, updateSchema.parse(req.body)));
  }),
);

/**
 * Upload de imagem da vitrine (logo/hero). Reaproveita o armazenamento do
 * estoque: data URL base64 → arquivo em /uploads, devolve a URL pública.
 */
const imageSchema = z.object({
  kind: z.enum(['logo', 'hero']),
  image: z.string().min(1),
});

storefrontRouter.post(
  '/images',
  requirePermission('storefront.manage'),
  ah(async (req, res) => {
    const { kind, image } = imageSchema.parse(req.body);
    const url = await saveImageDataUrl(`storefronts/${req.account!.id}`, image);
    res.status(201).json({ kind, url });
  }),
);
