import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_COOKIE, CSRF_HEADER, CSRF_VALUE } from '@harvestgo/shared';

const fake = vi.hoisted(() => ({
  resolveSession: vi.fn(),
  listDocuments: vi.fn(), uploadDocument: vi.fn(), updateDocument: vi.fn(), createDocumentUrl: vi.fn(), deleteDocument: vi.fn(),
}));
vi.mock('./services/authService.js', () => ({
  signIn: vi.fn(), resolveSession: fake.resolveSession, resolveAfterLogin: fake.resolveSession, refreshSession: vi.fn(),
}));
vi.mock('./services/documentService.js', () => ({
  listDocuments: fake.listDocuments, uploadDocument: fake.uploadDocument, updateDocument: fake.updateDocument,
  createDocumentUrl: fake.createDocumentUrl, deleteDocument: fake.deleteDocument,
}));

import { createApp } from './app.js';
import { HttpError } from './utils/errors.js';

const base = { userId: 'u1', email: 'x@farm.ph', fullName: 'X', accessToken: 'acc', db: {} };
const gm = { ...base, role: 'general_manager' };
const staff = { ...base, role: 'administrative_staff' };
const app = () => request(createApp());
const as = (r: request.Test) => r.set('Cookie', `${ACCESS_COOKIE}=acc`).set(CSRF_HEADER, CSRF_VALUE);
const recId = '9b1c2d3e-6a52-4b52-9a4e-1c2d3e4f5a6b';
const actId = '3f2a4d3e-6a52-4b52-9a4e-1c2d3e4f5a6b';
const file = Buffer.from('%PDF-1.4 pretend file bytes');
const upload = () => as(app().post('/api/v1/documents')).field('kind', 'supporting_document').attach('file', file, { filename: 'receipt.pdf', contentType: 'application/pdf' });

beforeEach(() => vi.clearAllMocks());

describe('logged-out visitors', () => {
  it('are refused everywhere', async () => {
    expect((await app().get('/api/v1/documents')).status).toBe(401);
    expect((await app().get(`/api/v1/documents/${recId}/url`)).status).toBe(401);
  });
});

describe('Administrative Staff', () => {
  beforeEach(() => fake.resolveSession.mockResolvedValue(staff));

  it('can list, upload, view and change a description', async () => {
    fake.listDocuments.mockResolvedValue({ records: [], total: 0, page: 1, pageSize: 20 });
    expect((await as(app().get('/api/v1/documents'))).status).toBe(200);

    fake.uploadDocument.mockResolvedValue({ id: recId });
    const up = await upload().field('caption', 'Receipt for substrate').field('documentDate', '2026-06-10').field('activityId', '');
    expect(up.status).toBe(201);
    const [, sent, fields] = [fake.uploadDocument.mock.calls[0]?.[0], fake.uploadDocument.mock.calls[0]?.[1], fake.uploadDocument.mock.calls[0]?.[2]];
    expect(sent.originalname).toBe('receipt.pdf');
    expect(fields).toEqual({ kind: 'supporting_document', caption: 'Receipt for substrate', documentDate: '2026-06-10', activityId: null });

    fake.createDocumentUrl.mockResolvedValue({ url: 'https://example/x', expiresInSeconds: 300 });
    expect((await as(app().get(`/api/v1/documents/${recId}/url`))).status).toBe(200);

    fake.updateDocument.mockResolvedValue({ id: recId });
    expect((await as(app().put(`/api/v1/documents/${recId}`).send({ caption: 'New caption', documentDate: '2026-06-10', activityId: actId }))).status).toBe(200);
  });

  it('cannot DELETE (403) and the delete code never runs', async () => {
    expect((await as(app().delete(`/api/v1/documents/${recId}`))).status).toBe(403);
    expect(fake.deleteDocument).not.toHaveBeenCalled();
  });

  it('cannot say who uploaded the file', async () => {
    fake.uploadDocument.mockResolvedValue({ id: recId });
    await upload().field('uploadedBy', 'someone-else');
    expect(fake.uploadDocument.mock.calls[0]?.[2]).not.toHaveProperty('uploadedBy');
  });

  it('is told clearly when no file was chosen', async () => {
    const res = await as(app().post('/api/v1/documents')).field('kind', 'photo');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_FILE');
    expect(fake.uploadDocument).not.toHaveBeenCalled();
  });

  it('is stopped by a file over 10 MB (413) before anything is checked', async () => {
    const res = await as(app().post('/api/v1/documents'))
      .field('kind', 'photo')
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1024), { filename: 'huge.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    expect(fake.uploadDocument).not.toHaveBeenCalled();
  });

  it('is stopped by more than one file', async () => {
    const res = await as(app().post('/api/v1/documents'))
      .field('kind', 'photo')
      .attach('file', file, 'a.pdf')
      .attach('file', file, 'b.pdf');
    expect(res.status).toBe(400);
    expect(fake.uploadDocument).not.toHaveBeenCalled();
  });

  it('is stopped by a bad kind, a future date, a long caption or a bad activity id', async () => {
    const cases: [string, Record<string, string>][] = [
      ['kind', { kind: 'virus' }],
      ['documentDate', { documentDate: '2999-01-01' }],
      ['caption', { caption: 'x'.repeat(301) }],
      ['activityId', { activityId: 'banana' }],
    ];
    for (const [field, bad] of cases) {
      let r = as(app().post('/api/v1/documents')).field('kind', 'photo');
      for (const [k, v] of Object.entries(bad)) r = r.field(k, v);
      const res = await r.attach('file', file, 'a.pdf');
      expect(res.status).toBe(400);
      expect(res.body.error.details[field]).toBeDefined();
    }
    expect(fake.uploadDocument).not.toHaveBeenCalled();
  });

  it('passes a "file type not allowed" refusal through', async () => {
    fake.uploadDocument.mockRejectedValue(new HttpError(415, 'UNSUPPORTED_FILE', 'This file type is not allowed.'));
    const res = await upload();
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE');
  });

  it('is stopped by bad filters and bad ids', async () => {
    expect((await as(app().get('/api/v1/documents?pageSize=9999'))).status).toBe(400);
    expect((await as(app().get('/api/v1/documents?kind=exe'))).status).toBe(400);
    expect((await as(app().get('/api/v1/documents/not-an-id/url'))).status).toBe(404);
    expect(fake.listDocuments).not.toHaveBeenCalled();
    expect(fake.createDocumentUrl).not.toHaveBeenCalled();
  });

  it('cannot upload without the safety header', async () => {
    const res = await app().post('/api/v1/documents').set('Cookie', `${ACCESS_COOKIE}=acc`).field('kind', 'photo').attach('file', file, 'a.pdf');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_BLOCKED');
  });
});

describe('General Manager', () => {
  it('can delete, and a missing file is a clean 404', async () => {
    fake.resolveSession.mockResolvedValue(gm);
    fake.deleteDocument.mockResolvedValue(undefined);
    expect((await as(app().delete(`/api/v1/documents/${recId}`))).status).toBe(200);
    fake.deleteDocument.mockRejectedValue(new HttpError(404, 'NOT_FOUND', 'Document not found.'));
    expect((await as(app().delete(`/api/v1/documents/${recId}`))).status).toBe(404);
  });
});