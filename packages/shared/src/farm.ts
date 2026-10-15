import { z } from 'zod';

// ---------------- Dates ----------------

/** Today's date in the Philippines, as YYYY-MM-DD. */
export function todayInManila(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** True only for real calendar dates written as YYYY-MM-DD (so 2026-02-30 fails). */
export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const dateSchema = z
  .string({ error: 'Enter a valid date.' })
  .refine(isValidIsoDate, { error: 'Enter a valid date.' })
  .refine((s) => s >= '2020-01-01', { error: 'That date is too far in the past.' });

const pastOrTodayDate = dateSchema.refine((s) => s <= todayInManila(), {
  error: 'The date cannot be in the future.',
});

// ---------------- Units ----------------
export const UNITS = ['kg', 'g', 'pcs'] as const;
export const unitSchema = z.enum(UNITS, { error: 'Choose a unit.' });
export type Unit = z.infer<typeof unitSchema>;
export const UNIT_LABELS: Record<Unit, string> = { kg: 'kg', g: 'g', pcs: 'pcs' };

// ---------------- Crops ----------------
export const cropCategorySchema = z.object({ id: z.number(), name: z.string() });
export type CropCategory = z.infer<typeof cropCategorySchema>;

export const cropSchema = z.object({
  id: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  categoryId: z.number(),
  categoryName: z.string(),
});
export type Crop = z.infer<typeof cropSchema>;

const cropNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Enter the crop name.' })
  .max(80, { error: 'The name is too long (80 characters max).' });

export const createCropSchema = z.object({
  categoryId: z.number({ error: 'Choose a category.' }).int().positive({ error: 'Choose a category.' }),
  name: cropNameSchema,
});
export type CreateCropInput = z.infer<typeof createCropSchema>;

export const updateCropSchema = z
  .object({ name: cropNameSchema.optional(), isActive: z.boolean().optional() })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { error: 'Nothing to change.' });
export type UpdateCropInput = z.infer<typeof updateCropSchema>;

// ---------------- Harvest records ----------------
const quantitySchema = z
  .number({ error: 'Enter a number.' })
  .positive({ error: 'The amount must be more than 0.' })
  .max(999999.999, { error: 'That number is too large.' })
  .refine((n) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6, {
    error: 'Use at most 3 decimal places.',
  });

/** Blank notes become null so "no notes" is always stored the same way. */
const notesSchema = z
  .string()
  .trim()
  .max(1000, { error: 'Notes are too long (1000 characters max).' })
  .nullish()
  .transform((v) => (v ? v : null));

const harvestFields = z.object({
  cropId: z.uuid({ error: 'Choose a crop.' }),
  harvestDate: pastOrTodayDate,
  quantity: quantitySchema,
  unit: unitSchema,
  notes: notesSchema,
});

/** `confirmDuplicate` = "yes, I know a similar record exists, save anyway". */
export const createHarvestSchema = harvestFields.extend({ confirmDuplicate: z.boolean().optional() });
export type CreateHarvestInput = z.infer<typeof createHarvestSchema>;

export const updateHarvestSchema = harvestFields
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { error: 'Nothing to change.' });
export type UpdateHarvestInput = z.infer<typeof updateHarvestSchema>;

export const HARVEST_SORTS = ['date_desc', 'date_asc', 'quantity_desc', 'quantity_asc'] as const;
export type HarvestSort = (typeof HARVEST_SORTS)[number];

/** What the list page may ask for. Page size is capped to keep things fast on slow connections. */
export const listHarvestsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  cropId: z.uuid().optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  sort: z.enum(HARVEST_SORTS).default('date_desc'),
});
export type ListHarvestsQuery = z.infer<typeof listHarvestsQuery>;

export const harvestRecordSchema = z.object({
  id: z.string(),
  cropId: z.string(),
  cropName: z.string(),
  categoryName: z.string(),
  harvestDate: z.string(),
  quantity: z.number(),
  unit: unitSchema,
  notes: z.string().nullable(),
  createdBy: z.string(),
  createdByName: z.string(),
  createdAt: z.string(),
});
export type HarvestRecord = z.infer<typeof harvestRecordSchema>;

export const harvestListSchema = z.object({
  records: z.array(harvestRecordSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type HarvestList = z.infer<typeof harvestListSchema>;