import type { RequestHandler } from 'express';
import { z } from 'zod';
import { HttpError } from '../utils/errors.js';
import { sendError } from '../utils/http.js';

/** Checks the request body against a Zod schema. Bad input never reaches our code. */
export const validateBody =
  (schema: z.ZodType): RequestHandler =>
  (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = z.flattenError(result.error).fieldErrors as Record<string, string[]>;
      return sendError(res, 400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', details);
    }
    req.body = result.data;
    return next();
  };

/** Same idea for the "?page=2&crop=..." part of an address. */
export function parseQuery<S extends z.ZodType>(schema: S, query: unknown): z.output<S> {
  const result = schema.safeParse(query);
  if (!result.success) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Some filters are not valid.',
      z.flattenError(result.error).fieldErrors as Record<string, string[]>,
    );
  }
  return result.data;
}