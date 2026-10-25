import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_COOKIE, CSRF_HEADER, CSRF_VALUE } from '@harvestgo/shared';

const fake = vi.hoisted(() => ({
  resolveSession: vi.fn(),
  previewReport: vi.fn(), listReports: vi.fn(), generateReport: vi.fn(), createReportUrl: vi.fn(), deleteReport: vi.fn(),
  getActiveTemplate: vi.fn(), installOfficialTemplate: vi.fn(),
}));
vi.mock('./services/authService.js', () => ({
  signIn: vi.fn(), resolveSession: fake.resolveSession, resolveAfterLogin: fake.resolveSession, refreshSession: vi.fn(),
}));
vi.mock('./services/reportService.js', () => ({
  previewReport: fake.previewReport, listReports: fake.listReports, generateReport: fake.generateReport,
  createReportUrl: fake.createReportUrl, deleteReport: fake.deleteReport,
}));
vi.mock('./services/templateService.js', () => ({
  getActiveTemplate: fake.getActiveTemplate, installOfficialTemplate: fake.installOfficialTemplate,
}));

import { createApp } from './app.js';
import { HttpError } from './utils/errors.js';

const base = { userId: 'u1', email: 'x@farm.ph', fullName: 'X', accessToken: 'acc', db: {} };
const gm = { ...base, role: 'general_manager' };
const staff = { ...base, role: 'administrative_staff' };
const app = () => request(createApp());
const as = (r: request.Test) => r.set('Cookie', `${ACCESS_COOKIE}=acc`).set(CSRF_HEADER, CSRF_VALUE);
const recId = '9b1c2d3e-6a52-4b52-9a4e-1c2d3e4f5a6b';
const photo = '3f2a4d3e-6a52-4b52-9a4e-1c2d3e4f5a6b';

beforeEach(() => vi.clearAllMocks());

describe('logged-out visitors', () => {
  it('are refused everywhere', async () => {
    for (const p of ['/api/v1/reports', '/api/v1/reports/preview?year=2026&quarter=2', '/api/v1/report-templates/active']) {
      expect((await app().get(p)).status).toBe(401);
    }
  });
});

describe('Administrative Staff', () => {
  beforeEach(() => fake.resolveSession.mockResolvedValue(staff));

  it('can preview, make, list and download reports', async () => {
    fake.previewReport.mockResolvedValue({ from: '2026-04-01' });
    const pv = await as(app().get('/api/v1/reports/preview?year=2026&quarter=2'));
    expect(pv.status).toBe(200);
    expect(fake.previewReport).toHaveBeenCalledWith(staff, 2026, 2);

    fake.generateReport.mockResolvedValue({ id: recId });
    const gen = await as(app().post('/api/v1/reports/generate').send({ year: 2026, quarter: 2, photoIds: [photo] }));
    expect(gen.status).toBe(201);
    expect(fake.generateReport).toHaveBeenCalledWith(staff, { year: 2026, quarter: 2, photoIds: [photo] });

    fake.listReports.mockResolvedValue({ records: [], total: 0, page: 1, pageSize: 20 });
    expect((await as(app().get('/api/v1/reports'))).status).toBe(200);
    fake.createReportUrl.mockResolvedValue({ url: 'https://x', expiresInSeconds: 300 });
    expect((await as(app().get(`/api/v1/reports/${recId}/url`))).status).toBe(200);
    fake.getActiveTemplate.mockResolvedValue(null);
    expect((await as(app().get('/api/v1/report-templates/active'))).status).toBe(200);
  });

  it('cannot DELETE a report (403) and the delete code never runs', async () => {
    expect((await as(app().delete(`/api/v1/reports/${recId}`))).status).toBe(403);
    expect(fake.deleteReport).not.toHaveBeenCalled();
  });

  it('cannot set up the template (403) and nothing is installed', async () => {
    const res = await as(app().post('/api/v1/report-templates/official'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(fake.installOfficialTemplate).not.toHaveBeenCalled();
  });

  it('is stopped by an impossible quarter, a repeated photo, or too many photos', async () => {
    expect((await as(app().get('/api/v1/reports/preview?year=2026&quarter=9'))).status).toBe(400);
    expect((await as(app().get('/api/v1/reports/preview'))).status).toBe(400);
    const dup = await as(app().post('/api/v1/reports/generate').send({ year: 2026, quarter: 2, photoIds: [photo, photo] }));
    expect(dup.status).toBe(400);
    expect(dup.body.error.details.photoIds).toBeDefined();
    expect((await as(app().post('/api/v1/reports/generate').send({ year: 2026, quarter: 0, photoIds: [] }))).status).toBe(400);
    expect(fake.generateReport).not.toHaveBeenCalled();
    expect(fake.previewReport).not.toHaveBeenCalled();
  });

  it('is stopped by bad list filters and bad ids', async () => {
    expect((await as(app().get('/api/v1/reports?pageSize=9999'))).status).toBe(400);
    expect((await as(app().get('/api/v1/reports/not-an-id/url'))).status).toBe(404);
    expect(fake.listReports).not.toHaveBeenCalled();
  });

  it('is told clearly when no template exists, or the system is busy', async () => {
    fake.generateReport.mockRejectedValueOnce(new HttpError(409, 'NO_TEMPLATE', 'No report template is set up yet.'));
    const none = await as(app().post('/api/v1/reports/generate').send({ year: 2026, quarter: 2, photoIds: [] }));
    expect(none.status).toBe(409);
    expect(none.body.error.code).toBe('NO_TEMPLATE');
    fake.generateReport.mockRejectedValueOnce(new HttpError(429, 'BUSY', 'The system is busy making other reports.'));
    expect((await as(app().post('/api/v1/reports/generate').send({ year: 2026, quarter: 2, photoIds: [] }))).status).toBe(429);
  });

  it('cannot make a report without the safety header', async () => {
    const res = await app().post('/api/v1/reports/generate').set('Cookie', `${ACCESS_COOKIE}=acc`).send({ year: 2026, quarter: 2, photoIds: [] });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_BLOCKED');
  });
});

describe('General Manager', () => {
  beforeEach(() => fake.resolveSession.mockResolvedValue(gm));

  it('can set up the official template', async () => {
    fake.installOfficialTemplate.mockResolvedValue({ id: 't1' });
    const res = await as(app().post('/api/v1/report-templates/official'));
    expect(res.status).toBe(201);
    expect(fake.installOfficialTemplate).toHaveBeenCalledWith(gm);
  });

  it('can delete a report, and a missing one is a clean 404', async () => {
    fake.deleteReport.mockResolvedValue(undefined);
    expect((await as(app().delete(`/api/v1/reports/${recId}`))).status).toBe(200);
    fake.deleteReport.mockRejectedValue(new HttpError(404, 'NOT_FOUND', 'Report not found.'));
    expect((await as(app().delete(`/api/v1/reports/${recId}`))).status).toBe(404);
  });
});