import { Router } from 'express';
import { createSaleSchema, listSalesQuery, updateSaleSchema } from '@harvestgo/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { parseQuery, validateBody } from '../middleware/validate.js';
import { createSale, deleteSale, listSales, updateSale } from '../services/saleService.js';
import { parseUuid } from '../utils/ids.js';

export function createSalesRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    res.json(await listSales(req.auth!, parseQuery(listSalesQuery, req.query)));
  });

  router.post('/', validateBody(createSaleSchema), async (req, res) => {
    res.status(201).json({ record: await createSale(req.auth!, req.body) });
  });

  router.put('/:id', validateBody(updateSaleSchema), async (req, res) => {
    res.json({ record: await updateSale(req.auth!, parseUuid(req.params.id, 'Sale'), req.body) });
  });

  router.delete('/:id', requireRole('general_manager'), async (req, res) => {
    await deleteSale(req.auth!, parseUuid(req.params.id, 'Sale'));
    res.json({ ok: true });
  });

  return router;
}