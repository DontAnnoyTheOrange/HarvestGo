import type { Response } from 'express';

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: Record<string, string[]>,
) {
  return res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}
