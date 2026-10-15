import type { RequestHandler } from 'express';
import type { Role } from '@harvestgo/shared';
import { sendError } from '../utils/http.js';

/** Guard 2: "Is your role allowed here?" Always used AFTER requireAuth. */
export const requireRole =
  (...allowed: Role[]): RequestHandler =>
  (req, res, next) => {
    if (!req.auth) return sendError(res, 401, 'UNAUTHENTICATED', 'Please log in.');
    if (!allowed.includes(req.auth.role)) {
      return sendError(res, 403, 'FORBIDDEN', 'You are not allowed to do that.');
    }
    return next();
  };
