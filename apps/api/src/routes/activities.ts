import { Router } from 'express';
import { createActivitySchema, listActivitiesQuery, setActivityStatusSchema, updateActivitySchema } from '@harvestgo/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { parseQuery, validateBody } from '../middleware/validate.js';
import {
  createActivity, deleteActivity, getActivity, listActivities, setActivityStatus, updateActivity,
} from '../services/activityService.js';
import { parseUuid } from '../utils/ids.js';

export function createActivitiesRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    res.json(await listActivities(req.auth!, parseQuery(listActivitiesQuery, req.query)));
  });

  router.get('/:id', async (req, res) => {
    res.json({ record: await getActivity(req.auth!, parseUuid(req.params.id, 'Activity')) });
  });

  router.post('/', validateBody(createActivitySchema), async (req, res) => {
    res.status(201).json({ record: await createActivity(req.auth!, req.body) });
  });

  // PUT = send the whole activity again (including its head-counts)
  router.put('/:id', validateBody(updateActivitySchema), async (req, res) => {
    res.json({ record: await updateActivity(req.auth!, parseUuid(req.params.id, 'Activity'), req.body) });
  });

  // Archive / unarchive
  router.patch('/:id/status', validateBody(setActivityStatusSchema), async (req, res) => {
    res.json({ record: await setActivityStatus(req.auth!, parseUuid(req.params.id, 'Activity'), req.body.status) });
  });

  // Deleting is for the General Manager only (SRS 1.3.1).
  router.delete('/:id', requireRole('general_manager'), async (req, res) => {
    await deleteActivity(req.auth!, parseUuid(req.params.id, 'Activity'));
    res.json({ ok: true });
  });

  return router;
}