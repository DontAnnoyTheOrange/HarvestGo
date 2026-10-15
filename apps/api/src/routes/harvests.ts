import { Router } from 'express';
import { createHarvestSchema, listHarvestsQuery, updateHarvestSchema } from '@harvestgo/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { parseQuery, validateBody } from '../middleware/validate.js';
import { createHarvest, deleteHarvest, getHarvest, listHarvests, updateHarvest } from '../services/harvestService.js';
import { parseUuid } from '../utils/ids.js';

export function createHarvestsRouter() {
  const router = Router();
  router.use(requireAuth); // everything here needs a login

  router.get('/', async (req, res) => {
    res.json(await listHarvests(req.auth!, parseQuery(listHarvestsQuery, req.query)));
  });

  router.get('/:id', async (req, res) => {
    res.json({ record: await getHarvest(req.auth!, parseUuid(req.params.id, 'Harvest record')) });
  });

  router.post('/', validateBody(createHarvestSchema), async (req, res) => {
    res.status(201).json({ record: await createHarvest(req.auth!, req.body) });
  });

  router.patch('/:id', validateBody(updateHarvestSchema), async (req, res) => {
    res.json({ record: await updateHarvest(req.auth!, parseUuid(req.params.id, 'Harvest record'), req.body) });
  });

  // Deleting is for the General Manager only (SRS 1.3.1).
  router.delete('/:id', requireRole('general_manager'), async (req, res) => {
    await deleteHarvest(req.auth!, parseUuid(req.params.id, 'Harvest record'));
    res.json({ ok: true });
  });

  return router;
}