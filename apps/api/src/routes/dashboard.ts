import { Router } from 'express';
import { dashboardQuery } from '@harvestgo/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { parseQuery } from '../middleware/validate.js';
import { dashboardSummary } from '../services/dashboardService.js';

export function createDashboardRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get('/summary', async (req, res) => {
    res.json(await dashboardSummary(req.auth!, parseQuery(dashboardQuery, req.query)));
  });

  return router;
}