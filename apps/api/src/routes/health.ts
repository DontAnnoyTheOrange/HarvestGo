import { Router } from 'express';
import type { HealthResponse } from '@harvestgo/shared';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const body: HealthResponse = {
    status: 'ok',
    service: 'harvestgo-api',
    time: new Date().toISOString(),
  };
  res.json(body);
});
