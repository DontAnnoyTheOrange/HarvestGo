import type { PostgrestError } from '@supabase/supabase-js';
import { HttpError, ServiceUnavailableError } from './errors.js';

/** Turns a database complaint into a clear message for the person (or a "system problem" notice). */
export function throwDbError(error: PostgrestError, what: string): never {
  switch (error.code) {
    case '23505':
      throw new HttpError(409, 'ALREADY_EXISTS', `${what} already exists.`);
    case '23503':
      throw new HttpError(400, 'INVALID_REFERENCE', 'One of the chosen items does not exist.');
    case '23514':
    case '22P02':
    case '22003':
      throw new HttpError(400, 'INVALID_DATA', 'Some values are not allowed.');
    case '42501':
      throw new HttpError(403, 'FORBIDDEN', 'You are not allowed to do that.');
    default:
      throw new ServiceUnavailableError(`${what}: ${error.code} ${error.message}`);
  }
}