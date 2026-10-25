import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { getActiveTemplate, installOfficialTemplate } from '../services/templateService.js';

export function createReportTemplatesRouter() {
  const router = Router();
  router.use(requireAuth);

  // Everyone logged in can see which template is in use (the report screen needs its photo limit).
  router.get('/active', async (req, res) => {
    res.json({ template: await getActiveTemplate(req.auth!) });
  });

  // Only the General Manager sets up the official template.
  router.post('/official', requireRole('general_manager'), async (req, res) => {
    res.status(201).json({ template: await installOfficialTemplate(req.auth!) });
  });

  return router;
}