import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { generateReportSchema, listReportsQuery, previewReportQuery } from '@harvestgo/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { parseQuery, validateBody } from '../middleware/validate.js';
import { createReportUrl, deleteReport, generateReport, listReports, previewReport } from '../services/reportService.js';
import { sendError } from '../utils/http.js';
import { parseUuid } from '../utils/ids.js';

export function createReportsRouter() {
  const router = Router();
  router.use(requireAuth);

  // Making a PDF is the heaviest job on the server, so it is limited: 10 per 15 minutes per computer.
  const generateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => sendError(res, 429, 'TOO_MANY_REPORTS', 'Too many reports in a short time. Please wait a few minutes.'),
  });

  // "Review the numbers" before making the PDF
  router.get('/preview', async (req, res) => {
    const { year, quarter } = parseQuery(previewReportQuery, req.query);
    res.json({ data: await previewReport(req.auth!, year, quarter) });
  });

  router.get('/', async (req, res) => {
    res.json(await listReports(req.auth!, parseQuery(listReportsQuery, req.query)));
  });

  router.post('/generate', generateLimiter, validateBody(generateReportSchema), async (req, res) => {
    res.status(201).json({ record: await generateReport(req.auth!, req.body) });
  });

  router.get('/:id/url', async (req, res) => {
    res.json(await createReportUrl(req.auth!, parseUuid(req.params.id, 'Report')));
  });

  // Deleting is for the General Manager only (SRS 1.3.1).
  router.delete('/:id', requireRole('general_manager'), async (req, res) => {
    await deleteReport(req.auth!, parseUuid(req.params.id, 'Report'));
    res.json({ ok: true });
  });

  return router;
}