import { z } from 'zod';
import type { Crop, CropCategory, CreateCropInput, UpdateCropInput } from '@harvestgo/shared';
import type { AuthContext } from '../types.js';
import { HttpError } from '../utils/errors.js';
import { throwDbError } from '../utils/dbErrors.js';

const CROP_SELECT = 'id, name, is_active, category_id, crop_categories(name)';

const nameOnly = z.object({ name: z.string() });
const cropRow = z.object({
  id: z.string(),
  name: z.string(),
  is_active: z.boolean(),
  category_id: z.number(),
  crop_categories: z.union([nameOnly, z.array(nameOnly)]).nullable(),
});

function toCrop(row: unknown): Crop {
  const r = cropRow.parse(row);
  const cat = Array.isArray(r.crop_categories) ? r.crop_categories[0] : r.crop_categories;
  return { id: r.id, name: r.name, isActive: r.is_active, categoryId: r.category_id, categoryName: cat?.name ?? '' };
}

export async function listCategories(actor: AuthContext): Promise<CropCategory[]> {
  const { data, error } = await actor.db.from('crop_categories').select('id, name').order('sort_order');
  if (error) throwDbError(error, 'Crop categories');
  return z.array(z.object({ id: z.number(), name: z.string() })).parse(data);
}

export async function listCrops(actor: AuthContext, includeInactive: boolean): Promise<Crop[]> {
  let q = actor.db.from('crops').select(CROP_SELECT).order('category_id').order('name');
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throwDbError(error, 'Crops');
  return (data ?? []).map(toCrop);
}

export async function createCrop(actor: AuthContext, input: CreateCropInput): Promise<Crop> {
  const { data, error } = await actor.db
    .from('crops')
    .insert({ category_id: input.categoryId, name: input.name })
    .select(CROP_SELECT)
    .single();
  if (error) throwDbError(error, 'That crop');
  return toCrop(data);
}

export async function updateCrop(actor: AuthContext, id: string, patch: UpdateCropInput): Promise<Crop> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;

  const { data, error } = await actor.db.from('crops').update(row).eq('id', id).select(CROP_SELECT).maybeSingle();
  if (error) throwDbError(error, 'That crop');
  if (!data) throw new HttpError(404, 'NOT_FOUND', 'Crop not found.');
  return toCrop(data);
}