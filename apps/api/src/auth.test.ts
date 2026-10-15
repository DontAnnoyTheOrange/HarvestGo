import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_COOKIE, CSRF_HEADER, CSRF_VALUE, REFRESH_COOKIE } from '@harvestgo/shared';

// Replace the real Supabase with a pretend one we can control.
const fake = vi.hoisted(() => ({
  signIn: vi.fn(),
  resolveSession: vi.fn(),
  refreshSession: vi.fn(),
  revokeSession: vi.fn(),
}));
vi.mock('./services/authService.js', () => ({
  signIn: fake.signIn,
  resolveSession: fake.resolveSession,
  resolveAfterLogin: fake.resolveSession,
  refreshSession: fake.refreshSession,
}));
vi.mock('./supabase.js', () => ({ revokeSession: fake.revokeSession }));

import { createApp } from './app.js';
import { requireAuth } from './middleware/requireAuth.js';
import { requireRole } from './middleware/requireRole.js';

const tokens = { access_token: 'acc-1', refresh_token: 'ref-1', expires_in: 3600 };
const staffCtx = { userId: 'u1', email: 'bee@farm.ph', fullName: 'Staff Bee', role: 'administrative_staff', accessToken: 'acc-1', db: {} };
const gmCtx = { ...staffCtx, userId: 'u2', email: 'gm@farm.ph', fullName: 'Manager One', role: 'general_manager' };
const post = (path: string) => request(createApp()).post(path).set(CSRF_HEADER, CSRF_VALUE);

beforeEach(() => vi.clearAllMocks());

describe('POST /api/v1/auth/login', () => {
  it('rejects a missing password before touching Supabase', async () => {
    const res = await post('/api/v1/auth/login').send({ email: 'a@b.ph' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.password).toBeDefined();
    expect(fake.signIn).not.toHaveBeenCalled();
  });

  it('gives one generic message for wrong credentials and sets no cookies', async () => {
    fake.signIn.mockResolvedValue(null);
    const res = await post('/api/v1/auth/login').send({ email: 'a@b.ph', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Email or password is incorrect.');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('logs in an active user and sets protected cookies', async () => {
    fake.signIn.mockResolvedValue({ session: tokens, user: { id: 'u2' } });
    fake.resolveSession.mockResolvedValue(gmCtx);
    const res = await post('/api/v1/auth/login').send({ email: ' GM@Farm.ph ', password: 'secret-pass' });
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: 'u2', email: 'gm@farm.ph', fullName: 'Manager One', role: 'general_manager' });
    expect(fake.signIn).toHaveBeenCalledWith('gm@farm.ph', 'secret-pass'); // tidied by the rules
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join('\n');
    expect(cookies).toContain(`${ACCESS_COOKIE}=acc-1`);
    expect(cookies).toContain(`${REFRESH_COOKIE}=ref-1`);
    expect(cookies.match(/HttpOnly/g)?.length).toBe(2);
  });

  it('refuses a disabled or profile-less account and ends that login', async () => {
    fake.signIn.mockResolvedValue({ session: tokens, user: { id: 'u3' } });
    fake.resolveSession.mockResolvedValue(null);
    const res = await post('/api/v1/auth/login').send({ email: 'dee@farm.ph', password: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(fake.revokeSession).toHaveBeenCalledWith('acc-1');
  });
});

describe('GET /api/v1/auth/me', () => {
  it('says 401 with no login', async () => {
    const res = await request(createApp()).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns who you are with a valid login', async () => {
    fake.resolveSession.mockResolvedValue(staffCtx);
    const res = await request(createApp()).get('/api/v1/auth/me').set('Cookie', `${ACCESS_COOKIE}=acc-1`);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('administrative_staff');
  });

  it('quietly renews an expired login using the refresh cookie', async () => {
    fake.resolveSession.mockResolvedValueOnce(null).mockResolvedValueOnce(staffCtx);
    fake.refreshSession.mockResolvedValue({ access_token: 'acc-2', refresh_token: 'ref-2', expires_in: 3600 });
    const res = await request(createApp())
      .get('/api/v1/auth/me')
      .set('Cookie', [`${ACCESS_COOKIE}=old`, `${REFRESH_COOKIE}=ref-1`]);
    expect(res.status).toBe(200);
    expect((res.headers['set-cookie'] as unknown as string[]).join()).toContain('acc-2');
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('clears both cookies', async () => {
    const res = await post('/api/v1/auth/logout').set('Cookie', `${ACCESS_COOKIE}=acc-1`);
    expect(res.status).toBe(200);
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join('\n');
    expect(cookies).toContain(`${ACCESS_COOKIE}=;`);
    expect(cookies).toContain(`${REFRESH_COOKIE}=;`);
    expect(fake.revokeSession).toHaveBeenCalled();
  });
});

describe('requireRole (the Manager-only guard)', () => {
  const guarded = () => {
    const app = express();
    app.use(require_cookie());
    app.get('/gm-only', requireAuth, requireRole('general_manager'), (_q, r) => r.json({ ok: true }));
    return app;
  };
  function require_cookie() {
    return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
      req.cookies = { [ACCESS_COOKIE]: 'acc-1' };
      next();
    };
  }

  it('lets the General Manager in', async () => {
    fake.resolveSession.mockResolvedValue(gmCtx);
    expect((await request(guarded()).get('/gm-only')).status).toBe(200);
  });

  it('turns Administrative Staff away with 403', async () => {
    fake.resolveSession.mockResolvedValue(staffCtx);
    const res = await request(guarded()).get('/gm-only');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
