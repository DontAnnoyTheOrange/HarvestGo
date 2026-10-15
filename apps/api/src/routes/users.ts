import { Router } from 'express';
import { z } from 'zod';
import { createUserSchema, resetPasswordSchema, updateUserSchema } from '@harvestgo/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validateBody } from '../middleware/validate.js';
import { createUser, listUsers, resetPassword, updateUser } from '../services/userService.js';
import { HttpError } from '../utils/errors.js';

const idSchema = z.uuid();
const parseId = (raw: unknown) => {
  const id = idSchema.safeParse(raw);
  if (!id.success) throw new HttpError(404, 'NOT_FOUND', 'User not found.');
  return id.data;
};

export function createUsersRouter() {
  const router = Router();

  // Every door in this file needs: logged in AND General Manager.
  router.use(requireAuth, requireRole('general_manager'));

  router.get('/', async (req, res) => {
    res.json({ users: await listUsers(req.auth!) });
  });

  router.post('/', validateBody(createUserSchema), async (req, res) => {
    res.status(201).json({ user: await createUser(req.body) });
  });

  router.patch('/:id', validateBody(updateUserSchema), async (req, res) => {
    res.json({ user: await updateUser(req.auth!, parseId(req.params.id), req.body) });
  });

  router.post('/:id/reset-password', validateBody(resetPasswordSchema), async (req, res) => {
    await resetPassword(parseId(req.params.id), req.body);
    res.json({ ok: true });
  });

  return router;
}
