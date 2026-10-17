import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { listParticipantTypes } from '../services/participantTypeService.js';

export function createParticipantTypesRouter() {
  const router = Router();
  router.use(requireAuth);
  router.get('/', async (req, res) => {
    res.json({ participantTypes: await listParticipantTypes(req.auth!) });
  });
  return router;
}