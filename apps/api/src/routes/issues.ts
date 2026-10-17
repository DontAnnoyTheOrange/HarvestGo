import { Router } from 'express';
import { createIssueSchema, listIssuesQuery, updateIssueSchema } from '@harvestgo/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { parseQuery, validateBody } from '../middleware/validate.js';
import { createIssue, deleteIssue, listIssues, updateIssue } from '../services/issueService.js';
import { parseUuid } from '../utils/ids.js';

export function createIssuesRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    res.json(await listIssues(req.auth!, parseQuery(listIssuesQuery, req.query)));
  });

  router.post('/', validateBody(createIssueSchema), async (req, res) => {
    res.status(201).json({ record: await createIssue(req.auth!, req.body) });
  });

  router.put('/:id', validateBody(updateIssueSchema), async (req, res) => {
    res.json({ record: await updateIssue(req.auth!, parseUuid(req.params.id, 'Issue'), req.body) });
  });

  router.delete('/:id', requireRole('general_manager'), async (req, res) => {
    await deleteIssue(req.auth!, parseUuid(req.params.id, 'Issue'));
    res.json({ ok: true });
  });

  return router;
}