import { z } from 'zod';
import { HttpError } from './errors.js';

const uuid = z.uuid();

/** Makes sure an id from the address bar really looks like an id. */
export function parseUuid(raw: unknown, what: string): string {
  const r = uuid.safeParse(raw);
  if (!r.success) throw new HttpError(404, 'NOT_FOUND', `${what} not found.`);
  return r.data;
}