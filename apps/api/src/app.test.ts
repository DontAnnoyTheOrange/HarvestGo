import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { CSRF_HEADER, CSRF_VALUE, healthResponseSchema } from '@harvestgo/shared';
import { createApp } from './app.js';

describe('API basics', () => {
  it('answers the health check in the agreed shape', async () => {
    const res = await request(createApp()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(healthResponseSchema.safeParse(res.body).success).toBe(true);
  });

  it('answers unknown addresses with a clean 404', async () => {
    const res = await request(createApp()).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects broken JSON without leaking details', async () => {
    const res = await request(createApp())
      .post('/api/v1/health')
      .set(CSRF_HEADER, CSRF_VALUE)
      .set('Content-Type', 'application/json')
      .send('{ not json');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/stack|SyntaxError/);
  });

  it('blocks changes that lack the anti-forgery header', async () => {
    const res = await request(createApp()).post('/api/v1/auth/logout');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_BLOCKED');
  });
});
