import { z } from 'zod';
import {
  unitSchema,
  type CreateHarvestInput,
  type HarvestList,
  type HarvestRecord,
  type ListHarvestsQuery,
  type UpdateHarvestInput,
} from '@harvestgo/shared';
import type { AuthContext } from '../types.js';
import { HttpError } from '../utils/errors.js';
import { throwDbError } from '../utils/dbErrors.js';

// "crops(...)" and "profiles(...)" pull in the crop name and the recorder's name in the same request.
const SELECT =
  'id, crop_id, harvest_date, quantity, unit, notes, created_by, created_at, crops(name, crop_categories(name)), profiles(full_name)';

const catRow = z.object({ name: z.string() });
const cropEmbed = z.object({ name: z.string(), crop_categories: z.union([catRow, z.array(catRow)]).nullable() });
const profileEmbed = z.object({ full_name: z.string() });
const oneOf = <T>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));

const row = z.object({
  id: z.string(),
  crop_id: z.string(),
  harvest_date: z.string(),
  quantity: z.coerce.number(),
  unit: unitSchema,
  notes: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
  crops: z.union([cropEmbed, z.array(cropEmbed)]).nullable(),
  profiles: z.union([profileEmbed, z.array(profileEmbed)]).nullable(),
});

function toRecord(raw: unknown): HarvestRecord {
  const r = row.parse(raw);
  const crop = oneOf(r.crops);
  return {
    id: r.id,
    cropId: r.crop_id,
    cropName: crop?.name ?? '(unknown crop)',
    categoryName: oneOf(crop?.crop_categories)?.name ?? '',
    harvestDate: r.harvest_date,
    quantity: r.quantity,
    unit: r.unit,
    notes: r.notes,
    createdBy: r.created_by,
    createdByName: oneOf(r.profiles)?.full_name ?? '',
    createdAt: r.created_at,
  };
}

// The database's query builder has a very long type; this small helper only adds filters.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withFilters<Q>(query: Q, f: ListHarvestsQuery): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = query;
  if (f.cropId) q = q.eq('crop_id', f.cropId);
  if (f.from) q = q.gte('harvest_date', f.from);
  if (f.to) q = q.lte('harvest_date', f.to);
  return q as Q;
}

export async function listHarvests(actor: AuthContext, f: ListHarvestsQuery): Promise<HarvestList> {
  const ascending = f.sort.endsWith('_asc');
  const by = f.sort.startsWith('quantity') ? 'quantity' : 'harvest_date';
  const start = (f.page - 1) * f.pageSize;

  const { data, count, error } = await withFilters(
    actor.db.from('harvest_records').select(SELECT, { count: 'exact' }),
    f,
  )
    .order(by, { ascending })
    .order('created_at', { ascending: false })
    .range(start, start + f.pageSize - 1);

  if (error) {
    // Asked for a page past the end (e.g. after deleting the last row of the last page).
    if (error.code === 'PGRST103') {
      const head = await withFilters(actor.db.from('harvest_records').select('id', { count: 'exact', head: true }), f);
      return { records: [], total: head.count ?? 0, page: f.page, pageSize: f.pageSize };
    }
    throwDbError(error, 'Harvest records');
  }
  return { records: (data ?? []).map(toRecord), total: count ?? 0, page: f.page, pageSize: f.pageSize };
}

export async function getHarvest(actor: AuthContext, id: string): Promise<HarvestRecord> {
  const { data, error } = await actor.db.from('harvest_records').select(SELECT).eq('id', id).maybeSingle();
  if (error) throwDbError(error, 'Harvest record');
  if (!data) throw new HttpError(404, 'NOT_FOUND', 'Harvest record not found.');
  return toRecord(data);
}

/** The chosen crop must exist and be switched on. */
async function assertCropUsable(actor: AuthContext, cropId: string) {
  const { data, error } = await actor.db.from('crops').select('id, is_active').eq('id', cropId).maybeSingle();
  if (error) throwDbError(error, 'Crop');
  if (!data) throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', { cropId: ['Choose a crop from the list.'] });
  if (!data.is_active) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', { cropId: ['This crop is switched off. Ask the General Manager.'] });
  }
}

export async function createHarvest(actor: AuthContext, input: CreateHarvestInput): Promise<HarvestRecord> {
  await assertCropUsable(actor, input.cropId);

  // SRS 2.1: check for duplicates before saving. We warn; the person decides.
  if (!input.confirmDuplicate) {
    const dup = await actor.db
      .from('harvest_records')
      .select('id')
      .eq('crop_id', input.cropId)
      .eq('harvest_date', input.harvestDate)
      .eq('quantity', input.quantity)
      .eq('unit', input.unit)
      .limit(1);
    if (dup.error) throwDbError(dup.error, 'Harvest record');
    if ((dup.data ?? []).length > 0) {
      throw new HttpError(409, 'DUPLICATE_SUSPECTED', 'A harvest with the same crop, date and amount is already recorded.');
    }
  }

  const { data, error } = await actor.db
    .from('harvest_records')
    .insert({
      crop_id: input.cropId,
      harvest_date: input.harvestDate,
      quantity: input.quantity,
      unit: input.unit,
      notes: input.notes,
      created_by: actor.userId, // always the real logged-in person, never taken from the request
    })
    .select(SELECT)
    .single();
  if (error) throwDbError(error, 'Harvest record');
  return toRecord(data);
}

export async function updateHarvest(actor: AuthContext, id: string, patch: UpdateHarvestInput): Promise<HarvestRecord> {
  const found = await actor.db.from('harvest_records').select('id, created_by, crop_id').eq('id', id).maybeSingle();
  if (found.error) throwDbError(found.error, 'Harvest record');
  if (!found.data) throw new HttpError(404, 'NOT_FOUND', 'Harvest record not found.');

  // Friendly version of a rule the database also enforces.
  if (actor.role !== 'general_manager' && found.data.created_by !== actor.userId) {
    throw new HttpError(403, 'FORBIDDEN', 'You can only edit records you entered yourself.');
  }
  if (patch.cropId !== undefined && patch.cropId !== found.data.crop_id) {
    await assertCropUsable(actor, patch.cropId);
  }

  const changes: Record<string, unknown> = {};
  if (patch.cropId !== undefined) changes.crop_id = patch.cropId;
  if (patch.harvestDate !== undefined) changes.harvest_date = patch.harvestDate;
  if (patch.quantity !== undefined) changes.quantity = patch.quantity;
  if (patch.unit !== undefined) changes.unit = patch.unit;
  if (patch.notes !== undefined) changes.notes = patch.notes;

  const { data, error } = await actor.db.from('harvest_records').update(changes).eq('id', id).select(SELECT).maybeSingle();
  if (error) throwDbError(error, 'Harvest record');
  if (!data) throw new HttpError(403, 'FORBIDDEN', 'You can only edit records you entered yourself.'); // blocked by the database rules
  return toRecord(data);
}

export async function deleteHarvest(actor: AuthContext, id: string): Promise<void> {
  const { data, error } = await actor.db.from('harvest_records').delete().eq('id', id).select('id');
  if (error) throwDbError(error, 'Harvest record');
  if (!data || data.length === 0) throw new HttpError(404, 'NOT_FOUND', 'Harvest record not found.');
}