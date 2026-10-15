import type { RequestHandler } from 'express';
import { CSRF_HEADER, CSRF_VALUE } from '@harvestgo/shared';
import { sendError } from '../utils/http.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Anything that changes data must carry a special header. A page on another website
 * cannot add it without our permission, so forged requests are blocked.
 */
export const csrfGuard: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.has(req.method) || req.get(CSRF_HEADER) === CSRF_VALUE) return next();
  return sendError(res, 403, 'CSRF_BLOCKED', 'Request blocked.');
};
