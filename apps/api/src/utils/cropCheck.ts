import type { AuthContext } from '../types.js';
import { HttpError } from './errors.js';
import { throwDbError } from './dbErrors.js';

/** The chosen crop must exist and be switched on. */
export async function assertCropUsable(actor: AuthContext, cropId: string): Promise<void> {
  const { data, error } = await actor.db.from('crops').select('id, is_active').eq('id', cropId).maybeSingle();
  if (error) throwDbError(error, 'Crop');
  const fail = (msg: string) =>
    new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', { cropId: [msg] });
  if (!data) throw fail('Choose a crop from the list.');
  if (!data.is_active) throw fail('This crop is switched off. Ask the General Manager.');
}

/** Adds the date-range filters that every record list shares. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withDateRange<Q>(query: Q, column: string, f: { cropId?: string; from?: string; to?: string }): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = query;
  if (f.cropId) q = q.eq('crop_id', f.cropId);
  if (f.from) q = q.gte(column, f.from);
  if (f.to) q = q.lte(column, f.to);
  return q as Q;
}