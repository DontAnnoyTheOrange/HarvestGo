import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { documentKindSchema } from '@harvestgo/shared';
import type {
  DocumentList, DocumentRecord, DocumentUrl, ListDocumentsQuery, UpdateDocumentInput, UploadFields,
} from '@harvestgo/shared';
import type { AuthContext } from '../types.js';
import { withDateRange } from '../utils/cropCheck.js';
import { throwDbError } from '../utils/dbErrors.js';
import { oneOf, profileEmbed } from '../utils/embeds.js';
import { HttpError, ServiceUnavailableError } from '../utils/errors.js';
import { prepareUpload, safeFileName } from '../utils/fileProcessing.js';

export const DOCUMENTS_BUCKET = 'harvestgo-documents'; // private: nothing here is public
const SIGNED_URL_SECONDS = 300;

const SELECT =
  'id, kind, original_name, mime_type, size_bytes, caption, document_date, activity_id, uploaded_by, created_at, ' +
  'service_activities(title), profiles(full_name)';

const activityTitle = z.object({ title: z.string() });
const row = z.object({
  id: z.string(),
  kind: documentKindSchema,
  original_name: z.string(),
  mime_type: z.string(),
  size_bytes: z.number(),
  caption: z.string().nullable(),
  document_date: z.string(),
  activity_id: z.string().nullable(),
  uploaded_by: z.string(),
  created_at: z.string(),
  service_activities: z.union([activityTitle, z.array(activityTitle)]).nullable(),
  profiles: z.union([profileEmbed, z.array(profileEmbed)]).nullable(),
});

function toRecord(raw: unknown): DocumentRecord {
  const r = row.parse(raw);
  return {
    id: r.id,
    kind: r.kind,
    originalName: r.original_name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    caption: r.caption,
    documentDate: r.document_date,
    activityId: r.activity_id,
    activityTitle: oneOf(r.service_activities)?.title ?? null,
    uploadedBy: r.uploaded_by,
    uploadedByName: oneOf(r.profiles)?.full_name ?? '',
    createdAt: r.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filtered<Q>(query: Q, f: ListDocumentsQuery): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = withDateRange(query, 'document_date', f);
  if (f.kind) q = q.eq('kind', f.kind);
  if (f.activityId) q = q.eq('activity_id', f.activityId);
  return q as Q;
}

export async function listDocuments(actor: AuthContext, f: ListDocumentsQuery): Promise<DocumentList> {
  const start = (f.page - 1) * f.pageSize;
  const { data, count, error } = await filtered(actor.db.from('documents').select(SELECT, { count: 'exact' }), f)
    .order('document_date', { ascending: f.sort === 'date_asc' })
    .order('created_at', { ascending: false })
    .range(start, start + f.pageSize - 1);

  if (error) {
    if (error.code === 'PGRST103') {
      const head = await filtered(actor.db.from('documents').select('id', { count: 'exact', head: true }), f);
      return { records: [], total: head.count ?? 0, page: f.page, pageSize: f.pageSize };
    }
    throwDbError(error, 'Documents');
  }
  return { records: (data ?? []).map(toRecord), total: count ?? 0, page: f.page, pageSize: f.pageSize };
}

/**
 * The whole upload: check what the file really is, shrink photos, save the file in
 * PRIVATE storage under a random name, then record it. If recording fails, the file is removed again.
 */
export async function uploadDocument(
  actor: AuthContext,
  file: { buffer: Buffer; originalname: string },
  fields: UploadFields,
): Promise<DocumentRecord> {
  const prepared = await prepareUpload(file.buffer);

  if (!prepared.isImage && fields.kind === 'photo') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', {
      kind: ['A PDF can only be a supporting document.'],
    });
  }

  const now = new Date();
  const path = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${prepared.ext}`;

  const up = await actor.db.storage.from(DOCUMENTS_BUCKET).upload(path, prepared.buffer, {
    contentType: prepared.mime,
    upsert: false,
  });
  if (up.error) {
    console.error('[documents] storage upload failed:', up.error.message);
    throw new ServiceUnavailableError(`storage upload failed: ${up.error.message}`);
  }

  const { data, error } = await actor.db
    .from('documents')
    .insert({
      kind: fields.kind,
      storage_path: path,
      original_name: safeFileName(file.originalname, prepared.ext),
      mime_type: prepared.mime,
      size_bytes: prepared.buffer.length,
      caption: fields.caption,
      document_date: fields.documentDate,
      activity_id: fields.activityId,
      uploaded_by: actor.userId, // always the real logged-in person
    })
    .select(SELECT)
    .single();

  if (error) {
    await actor.db.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => undefined); // do not leave an orphan file
    throwDbError(error, 'Document');
  }
  return toRecord(data);
}

export async function updateDocument(actor: AuthContext, id: string, input: UpdateDocumentInput): Promise<DocumentRecord> {
  const found = await actor.db.from('documents').select('id, uploaded_by').eq('id', id).maybeSingle();
  if (found.error) throwDbError(found.error, 'Document');
  if (!found.data) throw new HttpError(404, 'NOT_FOUND', 'Document not found.');
  if (actor.role !== 'general_manager' && found.data.uploaded_by !== actor.userId) {
    throw new HttpError(403, 'FORBIDDEN', 'You can only change files you uploaded yourself.');
  }

  const { data, error } = await actor.db
    .from('documents')
    .update({ caption: input.caption, document_date: input.documentDate, activity_id: input.activityId })
    .eq('id', id)
    .select(SELECT)
    .maybeSingle();
  if (error) throwDbError(error, 'Document');
  if (!data) throw new HttpError(403, 'FORBIDDEN', 'You can only change files you uploaded yourself.');
  return toRecord(data);
}

/** A link that works for 5 minutes, so the private file can be viewed or downloaded. */
export async function createDocumentUrl(actor: AuthContext, id: string): Promise<DocumentUrl> {
  const found = await actor.db.from('documents').select('storage_path').eq('id', id).maybeSingle();
  if (found.error) throwDbError(found.error, 'Document');
  if (!found.data) throw new HttpError(404, 'NOT_FOUND', 'Document not found.');

  const signed = await actor.db.storage.from(DOCUMENTS_BUCKET).createSignedUrl(found.data.storage_path as string, SIGNED_URL_SECONDS);
  if (signed.error || !signed.data) {
    throw new ServiceUnavailableError(`signed url failed: ${signed.error?.message ?? 'no data'}`);
  }
  return { url: signed.data.signedUrl, expiresInSeconds: SIGNED_URL_SECONDS };
}

/** Removes the record first, then the file. (General Manager only.) */
export async function deleteDocument(actor: AuthContext, id: string): Promise<void> {
  const found = await actor.db.from('documents').select('id, storage_path').eq('id', id).maybeSingle();
  if (found.error) throwDbError(found.error, 'Document');
  if (!found.data) throw new HttpError(404, 'NOT_FOUND', 'Document not found.');

  const { data, error } = await actor.db.from('documents').delete().eq('id', id).select('id');
  if (error) throwDbError(error, 'Document');
  if (!data || data.length === 0) throw new HttpError(404, 'NOT_FOUND', 'Document not found.');

  const gone = await actor.db.storage.from(DOCUMENTS_BUCKET).remove([found.data.storage_path as string]);
  if (gone.error) console.error('[documents] file could not be removed from storage (orphan):', found.data.storage_path, gone.error.message);
}