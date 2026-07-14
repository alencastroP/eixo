import { Router } from 'express';
import { z } from 'zod';
import { UserRole, VehicleSaleStatus, VehicleType } from '@prisma/client';
import { authenticate, requireRole } from '../../middleware/auth';
import { ah } from '../../lib/errors';
import * as vehicles from './vehicles.service';

/** Módulo de Estoque. Leitura para autenticados; escrita restrita a ADMIN (lojista). */
export const vehiclesRouter = Router();
vehiclesRouter.use(authenticate);

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
    res.json(await vehicles.listVehicles(listSchema.parse(req.query)));
  }),
);

vehiclesRouter.get(
  '/facets',
  ah(async (_req, res) => {
    res.json(await vehicles.vehicleFacets());
  }),
);

const plateSchema = z.object({ plate: z.string().trim().min(6) });

vehiclesRouter.post(
  '/plate-lookup',
  requireRole(UserRole.ADMIN),
  ah(async (req, res) => {
    const { plate } = plateSchema.parse(req.body);
    res.json(await vehicles.lookupPlate(plate));
  }),
);

vehiclesRouter.get(
  '/:id',
  ah(async (req, res) => {
    res.json(await vehicles.getVehicle(req.params.id));
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
});

const generateDescSchema = z.object({ extraNotes: z.string().trim().max(600).optional() });

vehiclesRouter.post(
  '/:id/description/generate',
  requireRole(UserRole.ADMIN),
  ah(async (req, res) => {
    const { extraNotes } = generateDescSchema.parse(req.body);
    res.json(await vehicles.generateDescription(req.params.id, extraNotes));
  }),
);

vehiclesRouter.post(
  '/',
  requireRole(UserRole.ADMIN),
  ah(async (req, res) => {
    res.status(201).json(await vehicles.createVehicle(vehicleSchema.parse(req.body)));
  }),
);

vehiclesRouter.put(
  '/:id',
  requireRole(UserRole.ADMIN),
  ah(async (req, res) => {
    res.json(await vehicles.updateVehicle(req.params.id, vehicleSchema.parse(req.body)));
  }),
);

vehiclesRouter.delete(
  '/:id',
  requireRole(UserRole.ADMIN),
  ah(async (req, res) => {
    await vehicles.deleteVehicle(req.params.id);
    res.status(204).end();
  }),
);

// ─── Fotos ───────────────────────────────────────────────────────────────────

const photosSchema = z.object({
  images: z.array(z.string().min(1)).min(1, 'Nenhuma imagem enviada').max(20),
});

vehiclesRouter.post(
  '/:id/photos',
  requireRole(UserRole.ADMIN),
  ah(async (req, res) => {
    const { images } = photosSchema.parse(req.body);
    res.status(201).json(await vehicles.addPhotos(req.params.id, images));
  }),
);

const reorderSchema = z.object({
  order: z.array(z.string()).min(1),
  coverId: z.string().optional(),
});

vehiclesRouter.patch(
  '/:id/photos',
  requireRole(UserRole.ADMIN),
  ah(async (req, res) => {
    const { order, coverId } = reorderSchema.parse(req.body);
    res.json(await vehicles.reorderPhotos(req.params.id, order, coverId));
  }),
);

vehiclesRouter.delete(
  '/:id/photos/:photoId',
  requireRole(UserRole.ADMIN),
  ah(async (req, res) => {
    res.json(await vehicles.deletePhoto(req.params.id, req.params.photoId));
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
  requireRole(UserRole.ADMIN),
  ah(async (req, res) => {
    res.status(201).json(await vehicles.addCost(req.params.id, costSchema.parse(req.body)));
  }),
);

vehiclesRouter.delete(
  '/:id/costs/:costId',
  requireRole(UserRole.ADMIN),
  ah(async (req, res) => {
    res.json(await vehicles.deleteCost(req.params.id, req.params.costId));
  }),
);
