import { z } from 'zod';
import { isValidIsoDate, todayInManila } from './farm.js';

/** A photo may be up to 10 MB when picked (it is shrunk before saving); a PDF may be 5 MB. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_STORED_BYTES = 5 * 1024 * 1024;

const isoDate = z
  .string({ error: 'Enter a valid date.' })
  .refine(isValidIsoDate, { error: 'Enter a valid date.' })
  .refine((s) => s >= '2020-01-01', { error: 'That date is too far in the past.' });
const pastOrToday = isoDate.refine((s) => s <= todayInManila(), { error: 'The date cannot be in the future.' });

/** Form fields arrive as text; an empty box means "nothing". */
const blankTo = <T>(value: T) => (v: unknown) => (typeof v === 'string' && v.trim() === '' ? value : v);

const caption = z.string().trim().max(300, { error: 'The caption is too long (300 characters max).' }).nullish().transform((v) => (v ? v : null));
const optionalUuid = z.preprocess(blankTo(null), z.uuid({ error: 'Choose an activity from the list.' }).nullish()).transform((v) => v ?? null);

export const DOCUMENT_KINDS = ['photo', 'supporting_document'] as const;
export const documentKindSchema = z.enum(DOCUMENT_KINDS, { error: 'Choose photo or supporting document.' });
export type DocumentKind = z.infer<typeof documentKindSchema>;
export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  photo: 'Photo (for the report)',
  supporting_document: 'Supporting document',
};

/** The text boxes sent along with the file. */
export const uploadFieldsSchema = z.object({
  kind: documentKindSchema,
  caption,
  documentDate: z.preprocess(blankTo(undefined), pastOrToday.optional()).transform((v) => v ?? todayInManila()),
  activityId: optionalUuid,
});
export type UploadFields = z.infer<typeof uploadFieldsSchema>;

/** Editing changes only the description, never the file itself. */
export const updateDocumentSchema = z.object({
  caption,
  documentDate: pastOrToday,
  activityId: z.uuid({ error: 'Choose an activity from the list.' }).nullish().transform((v) => v ?? null),
});
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

export const DOCUMENT_SORTS = ['date_desc', 'date_asc'] as const;
export type DocumentSort = (typeof DOCUMENT_SORTS)[number];

export const listDocumentsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  kind: documentKindSchema.optional(),
  activityId: z.uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(DOCUMENT_SORTS).default('date_desc'),
});
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuery>;

export const documentRecordSchema = z.object({
  id: z.string(),
  kind: documentKindSchema,
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  caption: z.string().nullable(),
  documentDate: z.string(),
  activityId: z.string().nullable(),
  activityTitle: z.string().nullable(),
  uploadedBy: z.string(),
  uploadedByName: z.string(),
  createdAt: z.string(),
});
export type DocumentRecord = z.infer<typeof documentRecordSchema>;
export const documentListSchema = z.object({
  records: z.array(documentRecordSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type DocumentList = z.infer<typeof documentListSchema>;

/** A short-lived link to view a private file. */
export const documentUrlSchema = z.object({ url: z.string(), expiresInSeconds: z.number() });
export type DocumentUrl = z.infer<typeof documentUrlSchema>;