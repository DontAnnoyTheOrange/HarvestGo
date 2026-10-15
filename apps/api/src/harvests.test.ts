import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_COOKIE, CSRF_HEADER, CSRF_VALUE } from '@harvestgo/shared';

const fake = vi.hoisted(() => ({
  resolveSession: vi.fn(),
  listHarvests: vi.fn(),
  getHarvest: vi.fn(),
  createHarvest: vi.fn(),
  updateHarvest: vi.fn(),
  deleteHarvest: vi.fn(),
  listCrops: vi.fn(),
  listCategories: vi.fn(),
  createCrop: vi.fn(),
  updateCrop: vi.fn(),
}));
vi.mock('./services/authService.js', () => ({
  signIn: vi.fn(), resolveSession: fake.resolveSession, resolveAfterLogin: fake.resolveSession, refreshSession: vi.fn(),
}));
vi.mock('./services/harvestService.js', () => ({
  listHarvests: fake.listHarvests, getHarvest: fake.getHarvest, createHarvest: fake.createHarvest,
  updateHarvest: fake.updateHarvest, deleteHarvest: fake.deleteHarvest,
}));
vi.mock('./services/cropService.js', () => ({
  listCrops: fake.listCrops, listCategories: fake.listCategories, createCrop: fake.createCrop, updateCrop: fake.updateCrop,
}));

import { createApp } from './app.js';
import { HttpError } from './utils/errors.js';

const base = { userId: 'u1', email: 'x@farm.ph', fullName: 'X', accessToken: 'acc', db: {} };
const gm = { ...base, role: 'general_manager' };
const staff = { ...base, role: 'administrative_staff' };
const app = () => request(createApp());
const as = (r: request.Test) => r.set('Cookie', `${ACCESS_COOKIE}=acc`).set(CSRF_HEADER, CSRF_VALUE);
const cropId = '3f2a4d3e-6a52-4b52-9a4e-1c2d3e4f5a6b';
const recId = '9b1c2d3e-6a52-4b52-9a4e-1c2d3e4f5a6b';
const good = { cropId, harvestDate: '2026-06-10', quantity: 30.986, unit: 'kg', notes: 'First flush' };

beforeEach(() => vi.clearAllMocks());

describe('Harvest routes need a login', () => {
  it('say 401 when logged out', async () => {
    expect((await app().get('/api/v1/harvests')).status).toBe(401);
    expect((await app().get('/api/v1/crops')).status).toBe(401);
  });
});

describe('Administrative Staff', () => {
  beforeEach(() => fake.resolveSession.mockResolvedValue(staff));

  it('can list and record harvests', async () => {
    fake.listHarvests.mockResolvedValue({ records: [], total: 0, page: 1, pageSize: 20 });
    expect((await as(app().get('/api/v1/harvests'))).status).toBe(200);
    fake.createHarvest.mockResolvedValue({ id: recId });
    const res = await as(app().post('/api/v1/harvests').send(good));
    expect(res.status).toBe(201);
    expect(fake.createHarvest).toHaveBeenCalledWith(staff, expect.objectContaining({ quantity: 30.986, notes: 'First flush' }));
  });

  it('cannot DELETE (403) and the delete code never runs', async () => {
    const res = await as(app().delete(`/api/v1/harvests/${recId}`));
    expect(res.status).toBe(403);
    expect(fake.deleteHarvest).not.toHaveBeenCalled();
  });

  it('cannot add or change crops (403)', async () => {
    expect((await as(app().post('/api/v1/crops').send({ categoryId: 2, name: 'Okra' }))).status).toBe(403);
    expect((await as(app().patch(`/api/v1/crops/${cropId}`).send({ isActive: false }))).status).toBe(403);
    expect(fake.createCrop).not.toHaveBeenCalled();
    expect(fake.updateCrop).not.toHaveBeenCalled();
  });

  it('can read the crop list for the form', async () => {
    fake.listCrops.mockResolvedValue([]);
    const res = await as(app().get('/api/v1/crops'));
    expect(res.status).toBe(200);
    expect(fake.listCrops).toHaveBeenCalledWith(staff, false);
  });
});

describe('General Manager', () => {
  beforeEach(() => fake.resolveSession.mockResolvedValue(gm));

  it('can delete, and a missing record is a clean 404', async () => {
    fake.deleteHarvest.mockResolvedValue(undefined);
    expect((await as(app().delete(`/api/v1/harvests/${recId}`))).status).toBe(200);
    fake.deleteHarvest.mockRejectedValue(new HttpError(404, 'NOT_FOUND', 'Harvest record not found.'));
    expect((await as(app().delete(`/api/v1/harvests/${recId}`))).status).toBe(404);
  });

  it('can add a crop and switch one off', async () => {
    fake.createCrop.mockResolvedValue({ id: cropId });
    expect((await as(app().post('/api/v1/crops').send({ categoryId: 2, name: '  Okra ' }))).status).toBe(201);
    expect(fake.createCrop).toHaveBeenCalledWith(gm, { categoryId: 2, name: 'Okra' });
    fake.updateCrop.mockResolvedValue({ id: cropId });
    expect((await as(app().patch(`/api/v1/crops/${cropId}`).send({ isActive: false }))).status).toBe(200);
  });
});

describe('Input checks on the server', () => {
  beforeEach(() => fake.resolveSession.mockResolvedValue(staff));

  it('rejects bad harvest data with field-by-field messages', async () => {
    const res = await as(app().post('/api/v1/harvests').send({ ...good, quantity: -5, harvestDate: '2999-01-01' }));
    expect(res.status).toBe(400);
    expect(res.body.error.details.quantity).toBeDefined();
    expect(res.body.error.details.harvestDate).toBeDefined();
    expect(fake.createHarvest).not.toHaveBeenCalled();
  });

  it('cannot be tricked into saving as somebody else', async () => {
    fake.createHarvest.mockResolvedValue({ id: recId });
    await as(app().post('/api/v1/harvests').send({ ...good, createdBy: 'someone-else' }));
    const sent = fake.createHarvest.mock.calls[0]?.[1];
    expect(sent).not.toHaveProperty('createdBy');
  });

  it('passes the "possible duplicate" warning on as a 409', async () => {
    fake.createHarvest.mockRejectedValue(new HttpError(409, 'DUPLICATE_SUSPECTED', 'A harvest with the same crop, date and amount is already recorded.'));
    const res = await as(app().post('/api/v1/harvests').send(good));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_SUSPECTED');
  });

  it('keeps list sizes in bounds and rejects a bad filter', async () => {
    expect((await as(app().get('/api/v1/harvests?pageSize=5000'))).status).toBe(400);
    expect((await as(app().get('/api/v1/harvests?cropId=banana'))).status).toBe(400);
    expect((await as(app().get('/api/v1/harvests?sort=drop_table'))).status).toBe(400);
    expect(fake.listHarvests).not.toHaveBeenCalled();
  });

  it('turns a malformed id into 404 instead of reaching the database', async () => {
    expect((await as(app().get('/api/v1/harvests/not-an-id'))).status).toBe(404);
    expect(fake.getHarvest).not.toHaveBeenCalled();
  });

  it('applies defaults to the list request', async () => {
    fake.listHarvests.mockResolvedValue({ records: [], total: 0, page: 1, pageSize: 20 });
    await as(app().get('/api/v1/harvests'));
    expect(fake.listHarvests).toHaveBeenCalledWith(staff, { page: 1, pageSize: 20, sort: 'date_desc' });
  });
});