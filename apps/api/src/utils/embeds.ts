import { z } from 'zod';

/** Pieces of the database answer that carry the crop's name and the recorder's name. */
const catRow = z.object({ name: z.string() });
export const cropEmbed = z.object({ name: z.string(), crop_categories: z.union([catRow, z.array(catRow)]).nullable() });
export const profileEmbed = z.object({ full_name: z.string() });

export const oneOf = <T>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));

/** The same select text used by every list: row fields + crop name + category + recorder. */
export const withCropAndPerson = (fields: string) =>
  `${fields}, created_by, created_at, crops(name, crop_categories(name)), profiles(full_name)`;

export const embedded = z.object({
  created_by: z.string(),
  created_at: z.string(),
  crops: z.union([cropEmbed, z.array(cropEmbed)]).nullable(),
  profiles: z.union([profileEmbed, z.array(profileEmbed)]).nullable(),
});

export function describeEmbeds(r: z.infer<typeof embedded>) {
  const crop = oneOf(r.crops);
  return {
    cropName: crop?.name ?? '(unknown crop)',
    categoryName: oneOf(crop?.crop_categories)?.name ?? '',
    createdBy: r.created_by,
    createdByName: oneOf(r.profiles)?.full_name ?? '',
    createdAt: r.created_at,
  };
}