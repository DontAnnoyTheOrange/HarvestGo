import { Router } from 'express';
import { reportTemplateDocumentSchema, reportTemplatePreviewSchema, reportTemplateVersionSchema } from '@harvestgo/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validateBody } from '../middleware/validate.js';
import { getActiveTemplate, getTemplateDraft, installOfficialTemplate, saveTemplateConfig, saveTemplateDraft, deleteTemplateDraft } from '../services/templateService.js';
import { previewTemplatePdf } from '../services/reportService.js';

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

  router.get('/draft', requireRole('general_manager'), async (req, res) => {
    res.json({ draft: await getTemplateDraft(req.auth!) });
  });

  router.post('/draft', requireRole('general_manager'), validateBody(reportTemplateDocumentSchema), async (req, res) => {
    res.json({ draft: await saveTemplateDraft(req.auth!, req.body) });
  });

  router.delete('/draft', requireRole('general_manager'), async (req, res) => {
    await deleteTemplateDraft(req.auth!);
    res.json({ ok: true });
  });

  // General Manager may publish a v1 configuration or a named v2 document as a new immutable version.
  router.post('/custom', requireRole('general_manager'), validateBody(reportTemplateVersionSchema), async (req, res) => {
    res.status(201).json({ template: await saveTemplateConfig(req.auth!, req.body) });
  });

  // Render the unsaved v2 document without creating a template version or report history entry.
  router.post('/preview', requireRole('general_manager'), validateBody(reportTemplatePreviewSchema), async (req, res) => {
    const pdf = await previewTemplatePdf(req.auth!, req.body);
    res.type('application/pdf').set('Cache-Control', 'no-store').set('Content-Disposition', 'inline; filename="template-preview.pdf"').send(pdf);
  });

  return router;
}