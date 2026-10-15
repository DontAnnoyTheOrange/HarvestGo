import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_COOKIE, CSRF_HEADER, CSRF_VALUE } from '@harvestgo/shared';

const fake = vi.hoisted(() => ({
  resolveSession: vi.fn(),
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  resetPassword: vi.fn(),
}));
vi.mock('./services/authService.js', () => ({
  signIn: vi.fn(),
  resolveSession: fake.resolveSession,
  resolveAfterLogin: fake.resolveSession,
  refreshSession: vi.fn(),
}));
vi.mock('./services/userService.js', () => ({
  listUsers: fake.listUsers,
  createUser: fake.createUser,
  updateUser: fake.updateUser,
  resetPassword: fake.resetPassword,
}));

import { createApp } from './app.js';
import { HttpError } from './utils/errors.js';

const base = { userId: 'u1', email: 'x@farm.ph', fullName: 'X', accessToken: 'acc', db: {} };
const gm = { ...base, role: 'general_manager' };
const staff = { ...base, role: 'administrative_staff' };
const asUser = (r: request.Test) => r.set('Cookie', `${ACCESS_COOKIE}=acc`).set(CSRF_HEADER, CSRF_VALUE);
const app = () => request(createApp());
const goodNew = { fullName: 'Staff Bee', email: 'Bee@Farm.ph', role: 'administrative_staff', password: 'Harvest2026ok' };
const someId = '3f2a4d3e-6a52-4b52-9a4e-1c2d3e4f5a6b';

beforeEach(() => vi.clearAllMocks());

describe('Only the General Manager may touch /users', () => {
  it('turns away people who are not logged in (401)', async () => {
    expect((await app().get('/api/v1/users')).status).toBe(401);
  });

  it('turns away Administrative Staff on every door (403) without running any code', async () => {
    fake.resolveSession.mockResolvedValue(staff);
    const calls = [
      asUser(app().get('/api/v1/users')),
      asUser(app().post('/api/v1/users').send(goodNew)),
      asUser(app().patch(`/api/v1/users/${someId}`).send({ role: 'general_manager' })),
      asUser(app().post(`/api/v1/users/${someId}/reset-password`).send({ password: 'Harvest2026ok' })),
    ];
    for (const call of calls) {
      const res = await call;
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect(fake.listUsers).not.toHaveBeenCalled();
    expect(fake.createUser).not.toHaveBeenCalled();
    expect(fake.updateUser).not.toHaveBeenCalled();
    expect(fake.resetPassword).not.toHaveBeenCalled();
  });
});

describe('General Manager actions', () => {
  beforeEach(() => fake.resolveSession.mockResolvedValue(gm));

  it('lists users', async () => {
    fake.listUsers.mockResolvedValue([{ id: 'a', email: 'a@b.ph', fullName: 'A', role: 'general_manager', isActive: true }]);
    const res = await asUser(app().get('/api/v1/users'));
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
  });

  it('rejects a weak password before anything is created', async () => {
    const res = await asUser(app().post('/api/v1/users').send({ ...goodNew, password: 'short' }));
    expect(res.status).toBe(400);
    expect(res.body.error.details.password).toBeDefined();
    expect(fake.createUser).not.toHaveBeenCalled();
  });

  it('rejects a password with no number, and one that is too long', async () => {
    const noNumber = await asUser(app().post('/api/v1/users').send({ ...goodNew, password: 'onlyletterslong' }));
    expect(noNumber.body.error.details.password).toContain('Include at least one number.');
    const tooLong = await asUser(app().post('/api/v1/users').send({ ...goodNew, password: 'a1'.repeat(40) }));
    expect(tooLong.status).toBe(400);
  });

  it('rejects an unknown role', async () => {
    const res = await asUser(app().post('/api/v1/users').send({ ...goodNew, role: 'superadmin' }));
    expect(res.status).toBe(400);
  });

  it('creates a user with a tidied email', async () => {
    fake.createUser.mockResolvedValue({ id: 'n', email: 'bee@farm.ph', fullName: 'Staff Bee', role: 'administrative_staff', isActive: true });
    const res = await asUser(app().post('/api/v1/users').send(goodNew));
    expect(res.status).toBe(201);
    expect(fake.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'bee@farm.ph' }));
    expect(JSON.stringify(res.body)).not.toContain('Harvest2026ok'); // the password is never echoed back
  });

  it('passes a "duplicate email" problem on clearly (409)', async () => {
    fake.createUser.mockRejectedValue(new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.', { email: ['This email is already used.'] }));
    const res = await asUser(app().post('/api/v1/users').send(goodNew));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('refuses an empty change and a bad id', async () => {
    expect((await asUser(app().patch(`/api/v1/users/${someId}`).send({}))).status).toBe(400);
    const badId = await asUser(app().patch('/api/v1/users/not-an-id').send({ isActive: false }));
    expect(badId.status).toBe(404);
  });

  it('updates a user and resets a password', async () => {
    fake.updateUser.mockResolvedValue({ id: someId, email: 'b@f.ph', fullName: 'B', role: 'administrative_staff', isActive: false });
    const upd = await asUser(app().patch(`/api/v1/users/${someId}`).send({ isActive: false }));
    expect(upd.status).toBe(200);
    expect(fake.updateUser).toHaveBeenCalledWith(gm, someId, { isActive: false });

    fake.resetPassword.mockResolvedValue(undefined);
    const rst = await asUser(app().post(`/api/v1/users/${someId}/reset-password`).send({ password: 'NewHarvest2026' }));
    expect(rst.status).toBe(200);
  });

  it('blocks forged requests without the safety header', async () => {
    const res = await app().post('/api/v1/users').set('Cookie', `${ACCESS_COOKIE}=acc`).send(goodNew);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_BLOCKED');
  });
});
