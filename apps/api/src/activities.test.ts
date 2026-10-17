import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_COOKIE, CSRF_HEADER, CSRF_VALUE } from '@harvestgo/shared';

const fake = vi.hoisted(() => ({
  resolveSession: vi.fn(),
  listActivities: vi.fn(), getActivity: vi.fn(), createActivity: vi.fn(), updateActivity: vi.fn(), setActivityStatus: vi.fn(), deleteActivity: vi.fn(),
  listIssues: vi.fn(), createIssue: vi.fn(), updateIssue: vi.fn(), deleteIssue: vi.fn(),
  listParticipantTypes: vi.fn(),
}));
vi.mock('./services/authService.js', () => ({
  signIn: vi.fn(), resolveSession: fake.resolveSession, resolveAfterLogin: fake.resolveSession, refreshSession: vi.fn(),
}));
vi.mock('./services/activityService.js', () => ({
  listActivities: fake.listActivities, getActivity: fake.getActivity, createActivity: fake.createActivity,
  updateActivity: fake.updateActivity, setActivityStatus: fake.setActivityStatus, deleteActivity: fake.deleteActivity,
}));
vi.mock('./services/issueService.js', () => ({
  listIssues: fake.listIssues, createIssue: fake.createIssue, updateIssue: fake.updateIssue, deleteIssue: fake.deleteIssue,
}));
vi.mock('./services/participantTypeService.js', () => ({ listParticipantTypes: fake.listParticipantTypes }));

import { createApp } from './app.js';
import { HttpError } from './utils/errors.js';

const base = { userId: 'u1', email: 'x@farm.ph', fullName: 'X', accessToken: 'acc', db: {} };
const gm = { ...base, role: 'general_manager' };
const staff = { ...base, role: 'administrative_staff' };
const app = () => request(createApp());
const as = (r: request.Test) => r.set('Cookie', `${ACCESS_COOKIE}=acc`).set(CSRF_HEADER, CSRF_VALUE);
const recId = '9b1c2d3e-6a52-4b52-9a4e-1c2d3e4f5a6b';
const activity = {
  serviceType: 'training', title: 'Mushroom Cultivation Seminar', activityDate: '2026-06-21',
  description: 'Free seminar', scope: 'Open to farmers',
  attendance: [{ participantTypeId: 1, male: 10, female: 30 }, { participantTypeId: 2, male: 7, female: 14 }],
};
const issue = { issueDate: '2026-06-21', problem: 'Keeping accurate records of all harvest', actionTaken: 'Orientation of staff', recommendation: 'In-depth training on record keeping', cropId: null, activityId: null };

beforeEach(() => vi.clearAllMocks());

describe('logged-out visitors', () => {
  it('are refused everywhere', async () => {
    for (const p of ['/api/v1/activities', '/api/v1/issues', '/api/v1/participant-types']) {
      expect((await app().get(p)).status).toBe(401);
    }
  });
});

describe('participant types', () => {
  it('are readable by anyone logged in', async () => {
    fake.resolveSession.mockResolvedValue(staff);
    fake.listParticipantTypes.mockResolvedValue([{ id: 1, name: 'Farmers' }]);
    const res = await as(app().get('/api/v1/participant-types'));
    expect(res.status).toBe(200);
    expect(res.body.participantTypes[0].name).toBe('Farmers');
  });
});

describe.each([
  ['activities', '/api/v1/activities', activity, 'createActivity', 'updateActivity', 'deleteActivity', 'listActivities'],
  ['issues', '/api/v1/issues', issue, 'createIssue', 'updateIssue', 'deleteIssue', 'listIssues'],
] as const)('%s', (_name, url, good, create, update, del, list) => {
  describe('Administrative Staff', () => {
    beforeEach(() => fake.resolveSession.mockResolvedValue(staff));

    it('can list, add and edit', async () => {
      fake[list].mockResolvedValue({ records: [], total: 0, page: 1, pageSize: 20 });
      expect((await as(app().get(url))).status).toBe(200);
      fake[create].mockResolvedValue({ id: recId });
      expect((await as(app().post(url).send(good))).status).toBe(201);
      fake[update].mockResolvedValue({ id: recId });
      expect((await as(app().put(`${url}/${recId}`).send(good))).status).toBe(200);
    });

    it('cannot DELETE (403) and the delete code never runs', async () => {
      expect((await as(app().delete(`${url}/${recId}`))).status).toBe(403);
      expect(fake[del]).not.toHaveBeenCalled();
    });

    it('cannot save as somebody else', async () => {
      fake[create].mockResolvedValue({ id: recId });
      await as(app().post(url).send({ ...good, createdBy: 'someone-else' }));
      expect(fake[create].mock.calls[0]?.[1]).not.toHaveProperty('createdBy');
    });

    it('gets a clear 409 for a possible duplicate', async () => {
      fake[create].mockRejectedValue(new HttpError(409, 'DUPLICATE_SUSPECTED', 'Already recorded.'));
      const res = await as(app().post(url).send(good));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_SUSPECTED');
    });

    it('is stopped by bad filters and bad ids', async () => {
      expect((await as(app().get(`${url}?pageSize=9999`))).status).toBe(400);
      expect((await as(app().get(`${url}?sort=drop_table`))).status).toBe(400);
      expect((await as(app().put(`${url}/not-an-id`).send(good))).status).toBe(404);
      expect(fake[list]).not.toHaveBeenCalled();
    });
  });

  describe('General Manager', () => {
    it('can delete, and a missing record is a clean 404', async () => {
      fake.resolveSession.mockResolvedValue(gm);
      fake[del].mockResolvedValue(undefined);
      expect((await as(app().delete(`${url}/${recId}`))).status).toBe(200);
      fake[del].mockRejectedValue(new HttpError(404, 'NOT_FOUND', 'Not found.'));
      expect((await as(app().delete(`${url}/${recId}`))).status).toBe(404);
    });
  });
});

describe('activity-specific checks', () => {
  beforeEach(() => fake.resolveSession.mockResolvedValue(staff));

  it('rejects bad head-counts with a clear message and saves nothing', async () => {
    const bad = { ...activity, attendance: [{ participantTypeId: 1, male: -3, female: 1.5 }] };
    const res = await as(app().post('/api/v1/activities').send(bad));
    expect(res.status).toBe(400);
    expect(res.body.error.details.attendance).toBeDefined();
    expect(fake.createActivity).not.toHaveBeenCalled();
  });

  it('does not keep participant names even if someone sends them', async () => {
    fake.createActivity.mockResolvedValue({ id: recId });
    await as(app().post('/api/v1/activities').send({
      ...activity,
      attendance: [{ participantTypeId: 1, male: 1, female: 1, name: 'Juan', phone: '0917' }],
    }));
    expect(fake.createActivity.mock.calls[0]?.[1].attendance[0]).toEqual({ participantTypeId: 1, male: 1, female: 1 });
  });

  it('archives and unarchives, and refuses a made-up status', async () => {
    fake.setActivityStatus.mockResolvedValue({ id: recId });
    expect((await as(app().patch(`/api/v1/activities/${recId}/status`).send({ status: 'archived' }))).status).toBe(200);
    expect(fake.setActivityStatus).toHaveBeenCalledWith(staff, recId, 'archived');
    expect((await as(app().patch(`/api/v1/activities/${recId}/status`).send({ status: 'deleted' }))).status).toBe(400);
  });

  it('passes "not yours" through as 403', async () => {
    fake.updateActivity.mockRejectedValue(new HttpError(403, 'FORBIDDEN', 'You can only change activities you entered yourself.'));
    expect((await as(app().put(`/api/v1/activities/${recId}`).send(activity))).status).toBe(403);
  });

  it('applies defaults to the list request (active activities, newest first)', async () => {
    fake.listActivities.mockResolvedValue({ records: [], total: 0, page: 1, pageSize: 20 });
    await as(app().get('/api/v1/activities'));
    expect(fake.listActivities).toHaveBeenCalledWith(staff, { page: 1, pageSize: 20, status: 'active', sort: 'date_desc' });
  });
});