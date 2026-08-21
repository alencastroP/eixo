import { Router, type Request } from 'express';
import { z } from 'zod';
import { VehicleSaleStatus, VehicleType } from '@prisma/client';
import { requirePermission } from '../../middleware/permissions';
import { ah } from '../../lib/errors';
import * as vehicles from './vehicles.service';

/**
 * Módulo de Estoque. Leitura para autenticados; escrita restrita a ADMIN (lojista).
 * Toda operação é escopada por `req.account` (populado pelo guard de tenant em
 * app.ts) - o estoque de uma loja nunca é visível para outra.
 */
export const vehiclesRouter = Router();
vehiclesRouter.use(requirePermission('vehicles.view'));

/**
 * Ficha do veículo pronta para ESTE usuário: sem 'vehicles.costs', preço de
 * compra, gastos e margem saem da resposta. Toda rota que devolve a ficha
 * passa por aqui - inclusive as de escrita, que respondem com o veículo salvo.
 */
const fichaPara = (req: Request, detail: vehicles.VehicleDetail) =>
  req.user!.permissions!.includes('vehicles.costs') ? detail : vehicles.withoutCostData(detail);

const listSchema = z.object({
  brand: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  year: z.coerce.number().int().optional(),
  status: z.nativeEnum(VehicleSaleStatus).optional(),
  type: z.nativeEnum(VehicleType).optional(),
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

vehiclesRouter.get(
  '/',
  ah(async (req, res) => {
    res.json(await vehicles.listVehicles(req.account!.id, listSchema.parse(req.query)));
  }),
);

vehiclesRouter.get(
  '/facets',
  ah(async (req, res) => {
    res.json(await vehicles.vehicleFacets(req.account!.id));
  }),
);

const plateSchema = z.object({ plate: z.string().trim().min(6) });

vehiclesRouter.post(
  '/plate-lookup',
  requirePermission('vehicles.manage'),
  ah(async (req, res) => {
    const { plate } = plateSchema.parse(req.body);
    res.json(await vehicles.lookupPlate(plate));
  }),
);

vehiclesRouter.get(
  '/:id',
  ah(async (req, res) => {
    res.json(fichaPara(req, await vehicles.getVehicle(req.account!.id, req.params.id)));
  }),
);

const vehicleSchema = z.object({
  type: z.nativeEnum(VehicleType).default(VehicleType.CAR),
  brand: z.string().trim().min(1, 'Informe a marca'),
  model: z.string().trim().min(1, 'Informe o modelo'),
  version: z.string().trim().optional().nullable(),
  yearFabrication: z.coerce.number().int().min(1900).max(2100),
  yearModel: z.coerce.number().int().min(1900).max(2100),
  color: z.string().trim().optional().nullable(),
  fuel: z.string().trim().optional().nullable(),
  km: z.coerce.number().int().min(0).default(0),
  plate: z.string().trim().optional().nullable(),
  chassi: z.string().trim().optional().nullable(),
  renavam: z.string().trim().optional().nullable(),
  fipePrice: z.coerce.number().min(0).optional().nullable(),
  costPrice: z.coerce.number().min(0).optional().nullable(),
  salePrice: z.coerce.number().min(0, 'Informe o preço de venda'),
  status: z.nativeEnum(VehicleSaleStatus).default(VehicleSaleStatus.PREPARING),
  optionals: z.array(z.string()).default([]),
  notes: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  // vitrine pública
  showOnSite: z.boolean().default(true),
  featured: z.boolean().default(false),
});

const generateDescSchema = z.object({ extraNotes: z.string().trim().max(600).optional() });

vehiclesRouter.post(
  '/:id/description/generate',
  requirePermission('vehicles.manage'),
  ah(async (req, res) => {
    const { extraNotes } = generateDescSchema.parse(req.body);
    res.json(await vehicles.generateDescription(req.account!.id, req.params.id, extraNotes));
  }),
);

vehiclesRouter.post(
  '/',
  requirePermission('vehicles.manage'),
  ah(async (req, res) => {
    res.status(201).json(fichaPara(req, await vehicles.createVehicle(req.account!.id, vehicleSchema.parse(req.body))));
  }),
);

vehiclesRouter.put(
  '/:id',
  requirePermission('vehicles.manage'),
  ah(async (req, res) => {
    res.json(fichaPara(req, await vehicles.updateVehicle(req.account!.id, req.params.id, vehicleSchema.parse(req.body))));
  }),
);

vehiclesRouter.delete(
  '/:id',
  requirePermission('vehicles.manage'),
  ah(async (req, res) => {
    await vehicles.deleteVehicle(req.account!.id, req.params.id);
    res.status(204).end();
  }),
);

// ─── Fotos ───────────────────────────────────────────────────────────────────

const photosSchema = z.object({
  images: z.array(z.string().min(1)).min(1, 'Nenhuma imagem enviada').max(20),
});

vehiclesRouter.post(
  '/:id/photos',
  requirePermission('vehicles.manage'),
  ah(async (req, res) => {
    const { images } = photosSchema.parse(req.body);
    res.status(201).json(fichaPara(req, await vehicles.addPhotos(req.account!.id, req.params.id, images)));
  }),
);

const reorderSchema = z.object({
  order: z.array(z.string()).min(1),
  coverId: z.string().optional(),
});

vehiclesRouter.patch(
  '/:id/photos',
  requirePermission('vehicles.manage'),
  ah(async (req, res) => {
    const { order, coverId } = reorderSchema.parse(req.body);
    res.json(fichaPara(req, await vehicles.reorderPhotos(req.account!.id, req.params.id, order, coverId)));
  }),
);

vehiclesRouter.delete(
  '/:id/photos/:photoId',
  requirePermission('vehicles.manage'),
  ah(async (req, res) => {
    res.json(fichaPara(req, await vehicles.deletePhoto(req.account!.id, req.params.id, req.params.photoId)));
  }),
);

// ─── Custos ──────────────────────────────────────────────────────────────────

const costSchema = z.object({
  category: z.string().trim().min(1),
  description: z.string().trim().min(1),
  amount: z.coerce.number().min(0),
  incurredAt: z.string().optional(),
});

vehiclesRouter.post(
  '/:id/costs',
  requirePermission('vehicles.costs'),
  ah(async (req, res) => {
    res.status(201).json(fichaPara(req, await vehicles.addCost(req.account!.id, req.params.id, costSchema.parse(req.body))));
  }),
);

vehiclesRouter.delete(
  '/:id/costs/:costId',
  requirePermission('vehicles.costs'),
  ah(async (req, res) => {
    res.json(fichaPara(req, await vehicles.deleteCost(req.account!.id, req.params.id, req.params.costId)));
  }),
);
