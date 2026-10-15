import { Router } from 'express';
import { z } from 'zod';
import { createCropSchema, updateCropSchema } from '@harvestgo/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { parseQuery, validateBody } from '../middleware/validate.js';
import { createCrop, listCategories, listCrops, updateCrop } from '../services/cropService.js';
import { parseUuid } from '../utils/ids.js';

export function createCropCategoriesRouter() {
  const router = Router();
  router.use(requireAuth);
  router.get('/', async (req, res) => {
    res.json({ categories: await listCategories(req.auth!) });
  });
  return router;
}

const listQuery = z.object({ includeInactive: z.enum(['true', 'false']).default('false') });

export function createCropsRouter() {
  const router = Router();
  router.use(requireAuth);

  // Everyone logged in may READ crops (the harvest form needs the list).
  router.get('/', async (req, res) => {
    const { includeInactive } = parseQuery(listQuery, req.query);
    res.json({ crops: await listCrops(req.auth!, includeInactive === 'true') });
  });

  // Only the General Manager changes the list.
  router.post('/', requireRole('general_manager'), validateBody(createCropSchema), async (req, res) => {
    res.status(201).json({ crop: await createCrop(req.auth!, req.body) });
  });

  router.patch('/:id', requireRole('general_manager'), validateBody(updateCropSchema), async (req, res) => {
    res.json({ crop: await updateCrop(req.auth!, parseUuid(req.params.id, 'Crop'), req.body) });
  });

  return router;
}