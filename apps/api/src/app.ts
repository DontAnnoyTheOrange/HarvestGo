import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { csrfGuard } from './middleware/csrf.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { createAuthRouter } from './routes/auth.js';
import { createCropCategoriesRouter, createCropsRouter } from './routes/crops.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createExpensesRouter } from './routes/expenses.js';
import { createHarvestsRouter } from './routes/harvests.js';
import { healthRouter } from './routes/health.js';
import { createSalesRouter } from './routes/sales.js';
import { createUsersRouter } from './routes/users.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // we sit behind the website's forwarder; use the visitor's real address
  app.use(helmet()); // safe default security headers
  app.use(cookieParser());
  app.use(csrfGuard); // forged cross-site changes stop here
  app.use(express.json({ limit: '100kb' })); // refuse oversized request bodies

  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', createAuthRouter());
  app.use('/api/v1/users', createUsersRouter());
  app.use('/api/v1/crop-categories', createCropCategoriesRouter());
  app.use('/api/v1/crops', createCropsRouter());
  app.use('/api/v1/harvests', createHarvestsRouter());
  app.use('/api/v1/expenses', createExpensesRouter());
  app.use('/api/v1/sales', createSalesRouter());
  app.use('/api/v1/dashboard', createDashboardRouter());

  app.use(notFound);
  app.use(errorHandler);
  return app;
}