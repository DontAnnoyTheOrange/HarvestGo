import sharp from 'sharp';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createDocumentUrl, deleteDocument, updateDocument, uploadDocument } from './services/documentService.js';

/** A pretend database call: any chain of .select().eq()... finally resolves to `result`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chain(result: unknown): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = new Proxy({}, { get: (_t, prop) => (prop === 'then' ? (res: (v: unknown) => void) => res(result) : () => c) });
  return c;
}
/** Pretend database + pretend private storage. */
function fakeDb(answers: unknown[], storage: { upload?: unknown; remove?: unknown; signed?: unknown } = {}) {
  const from = vi.fn();
  for (const a of answers) from.mockReturnValueOnce(chain(a));
  const upload = vi.fn().mockResolvedValue(storage.upload ?? { data: {}, error: null });
  const remove = vi.fn().mockResolvedValue(storage.remove ?? { data: [], error: null });
  const createSignedUrl = vi.fn().mockResolvedValue(storage.signed ?? { data: { signedUrl: 'https://files.example/signed?token=abc' }, error: null });
  const bucket = vi.fn().mockReturnValue({ upload, remove, createSignedUrl });
  return { from, storage: { from: bucket }, upload, remove, createSignedUrl, bucket };
}
const actor = (role: string, userId: string, db: unknown) => ({ userId, role, db }) as never;

const savedRow = {
  id: 'd1', kind: 'photo', original_name: 'field.jpg', mime_type: 'image/jpeg', size_bytes: 12345, caption: 'Harvest day',
  document_date: '2026-06-10', activity_id: null, uploaded_by: 'u1', created_at: '2026-06-10T00:00:00Z',
  service_activities: null, profiles: { full_name: 'Staff Bee' },
};
const fields = { kind: 'photo', caption: 'Harvest day', documentDate: '2026-06-10', activityId: null } as const;
let photo: Buffer;
beforeAll(async () => {
  photo = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: { r: 30, g: 140, b: 40 } } }).jpeg().toBuffer();
});

describe('uploadDocument', () => {
  it('shrinks the photo, saves it in the PRIVATE bucket under a random name, then records it', async () => {
    const db = fakeDb([{ data: savedRow, error: null }]);
    const rec = await uploadDocument(actor('administrative_staff', 'u1', db), { buffer: photo, originalname: 'IMG_0042.PNG' }, fields);

    expect(db.bucket).toHaveBeenCalledWith('harvestgo-documents');
    const [path, body, options] = db.upload.mock.calls[0]!;
    expect(path).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/); // year/month/random.jpg, never the person's file name
    expect(path).not.toContain('IMG_0042');
    expect(options).toEqual({ contentType: 'image/jpeg', upsert: false });
    expect((body as Buffer).length).toBeLessThan(photo.length);
    expect(rec).toMatchObject({ kind: 'photo', originalName: 'field.jpg', uploadedByName: 'Staff Bee', activityTitle: null });
  });

  it('refuses a disguised file before touching storage', async () => {
    const db = fakeDb([]);
    await expect(uploadDocument(actor('administrative_staff', 'u1', db), { buffer: Buffer.from('MZ\x90\x00 not really a photo'), originalname: 'cute.jpg' }, fields))
      .rejects.toMatchObject({ status: 415 });
    expect(db.upload).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalled();
  });

  it('refuses a PDF marked as a "photo"', async () => {
    const db = fakeDb([]);
    await expect(uploadDocument(actor('administrative_staff', 'u1', db), { buffer: Buffer.from('%PDF-1.4 hi'), originalname: 'a.pdf' }, fields))
      .rejects.toMatchObject({ status: 400, details: { kind: expect.any(Array) } });
    expect(db.upload).not.toHaveBeenCalled();
  });

  it('removes the file again if the record cannot be saved (no orphans)', async () => {
    const db = fakeDb([{ data: null, error: { code: '23503', message: 'bad activity' } }]);
    await expect(uploadDocument(actor('administrative_staff', 'u1', db), { buffer: photo, originalname: 'a.jpg' }, fields))
      .rejects.toMatchObject({ status: 400 });
    expect(db.remove).toHaveBeenCalledTimes(1);
    expect(db.remove.mock.calls[0]?.[0]).toEqual([db.upload.mock.calls[0]?.[0]]);
  });

  it('reports a storage problem as "temporarily unavailable" and records nothing', async () => {
    const db = fakeDb([], { upload: { data: null, error: { message: 'bucket not found' } } });
    await expect(uploadDocument(actor('administrative_staff', 'u1', db), { buffer: photo, originalname: 'a.jpg' }, fields))
      .rejects.toMatchObject({ status: 503 });
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe('updateDocument', () => {
  const input = { caption: 'New', documentDate: '2026-06-11', activityId: null };
  it("stops Staff changing someone else's file before touching it", async () => {
    const db = fakeDb([{ data: { id: 'd1', uploaded_by: 'other' }, error: null }]);
    await expect(updateDocument(actor('administrative_staff', 'u1', db), 'd1', input)).rejects.toMatchObject({ status: 403 });
    expect(db.from).toHaveBeenCalledTimes(1);
  });
  it('lets the uploader and the Manager change it; 404 if missing', async () => {
    const own = fakeDb([{ data: { id: 'd1', uploaded_by: 'u1' }, error: null }, { data: savedRow, error: null }]);
    await expect(updateDocument(actor('administrative_staff', 'u1', own), 'd1', input)).resolves.toBeDefined();
    const mgr = fakeDb([{ data: { id: 'd1', uploaded_by: 'other' }, error: null }, { data: savedRow, error: null }]);
    await expect(updateDocument(actor('general_manager', 'gm', mgr), 'd1', input)).resolves.toBeDefined();
    await expect(updateDocument(actor('general_manager', 'gm', fakeDb([{ data: null, error: null }])), 'd1', input)).rejects.toMatchObject({ status: 404 });
  });
});

describe('createDocumentUrl', () => {
  it('makes a 5-minute link for a private file', async () => {
    const db = fakeDb([{ data: { storage_path: '2026/06/abc.jpg' }, error: null }]);
    const out = await createDocumentUrl(actor('administrative_staff', 'u1', db), 'd1');
    expect(db.createSignedUrl).toHaveBeenCalledWith('2026/06/abc.jpg', 300);
    expect(out).toEqual({ url: 'https://files.example/signed?token=abc', expiresInSeconds: 300 });
  });
  it('404 for a record that is not there (never a link)', async () => {
    const db = fakeDb([{ data: null, error: null }]);
    await expect(createDocumentUrl(actor('administrative_staff', 'u1', db), 'd1')).rejects.toMatchObject({ status: 404 });
    expect(db.createSignedUrl).not.toHaveBeenCalled();
  });
  it('503 if storage cannot make the link', async () => {
    const db = fakeDb([{ data: { storage_path: 'x' }, error: null }], { signed: { data: null, error: { message: 'nope' } } });
    await expect(createDocumentUrl(actor('administrative_staff', 'u1', db), 'd1')).rejects.toMatchObject({ status: 503 });
  });
});

describe('deleteDocument', () => {
  it('removes the record, then the file', async () => {
    const db = fakeDb([{ data: { id: 'd1', storage_path: '2026/06/abc.jpg' }, error: null }, { data: [{ id: 'd1' }], error: null }]);
    await expect(deleteDocument(actor('general_manager', 'gm', db), 'd1')).resolves.toBeUndefined();
    expect(db.remove).toHaveBeenCalledWith(['2026/06/abc.jpg']);
  });
  it('404 and the file is left alone when the record is not found', async () => {
    const db = fakeDb([{ data: null, error: null }]);
    await expect(deleteDocument(actor('general_manager', 'gm', db), 'd1')).rejects.toMatchObject({ status: 404 });
    expect(db.remove).not.toHaveBeenCalled();
  });
  it('still succeeds if only the leftover file could not be removed (it is logged)', async () => {
    const db = fakeDb([{ data: { id: 'd1', storage_path: 'p' }, error: null }, { data: [{ id: 'd1' }], error: null }], { remove: { data: null, error: { message: 'x' } } });
    await expect(deleteDocument(actor('general_manager', 'gm', db), 'd1')).resolves.toBeUndefined();
  });
});