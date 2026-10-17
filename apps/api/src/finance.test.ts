import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_COOKIE, CSRF_HEADER, CSRF_VALUE } from '@harvestgo/shared';

const fake = vi.hoisted(() => ({
  resolveSession: vi.fn(),
  listExpenses: vi.fn(), createExpense: vi.fn(), updateExpense: vi.fn(), deleteExpense: vi.fn(),
  listSales: vi.fn(), createSale: vi.fn(), updateSale: vi.fn(), deleteSale: vi.fn(),
  dashboardSummary: vi.fn(),
}));
vi.mock('./services/authService.js', () => ({
  signIn: vi.fn(), resolveSession: fake.resolveSession, resolveAfterLogin: fake.resolveSession, refreshSession: vi.fn(),
}));
vi.mock('./services/expenseService.js', () => ({
  listExpenses: fake.listExpenses, createExpense: fake.createExpense, updateExpense: fake.updateExpense, deleteExpense: fake.deleteExpense,
}));
vi.mock('./services/saleService.js', () => ({
  listSales: fake.listSales, createSale: fake.createSale, updateSale: fake.updateSale, deleteSale: fake.deleteSale,
}));
vi.mock('./services/dashboardService.js', () => ({ dashboardSummary: fake.dashboardSummary }));

import { createApp } from './app.js';
import { HttpError } from './utils/errors.js';

const base = { userId: 'u1', email: 'x@farm.ph', fullName: 'X', accessToken: 'acc', db: {} };
const gm = { ...base, role: 'general_manager' };
const staff = { ...base, role: 'administrative_staff' };
const app = () => request(createApp());
const as = (r: request.Test) => r.set('Cookie', `${ACCESS_COOKIE}=acc`).set(CSRF_HEADER, CSRF_VALUE);
const cropId = '3f2a4d3e-6a52-4b52-9a4e-1c2d3e4f5a6b';
const recId = '9b1c2d3e-6a52-4b52-9a4e-1c2d3e4f5a6b';
const expense = { cropId, expenseDate: '2026-06-10', description: 'Substrate', amount: 198.25 };
const sale = { cropId, saleDate: '2026-06-10', saleType: 'value_added', productName: 'Mushroom Chips', quantity: 2, unit: 'kg', amount: 3052.5 };

beforeEach(() => vi.clearAllMocks());

describe('logged-out visitors', () => {
  it('are refused everywhere', async () => {
    for (const path of ['/api/v1/expenses', '/api/v1/sales', '/api/v1/dashboard/summary']) {
      expect((await app().get(path)).status).toBe(401);
    }
  });
});

describe.each([
  ['expenses', '/api/v1/expenses', expense, 'createExpense', 'updateExpense', 'deleteExpense', 'listExpenses'],
  ['sales', '/api/v1/sales', sale, 'createSale', 'updateSale', 'deleteSale', 'listSales'],
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

    it('cannot DELETE (403), and the delete code never runs', async () => {
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

describe('expense input checks', () => {
  beforeEach(() => fake.resolveSession.mockResolvedValue(staff));
  it('rejects zero, negative and over-precise amounts with field messages', async () => {
    for (const amount of [0, -3, 1.234]) {
      const res = await as(app().post('/api/v1/expenses').send({ ...expense, amount }));
      expect(res.status).toBe(400);
      expect(res.body.error.details.amount).toBeDefined();
    }
    expect(fake.createExpense).not.toHaveBeenCalled();
  });
});

describe('sale input checks', () => {
  beforeEach(() => fake.resolveSession.mockResolvedValue(staff));
  it('rejects a value-added sale with no product name', async () => {
    const res = await as(app().post('/api/v1/sales').send({ ...sale, productName: '' }));
    expect(res.status).toBe(400);
    expect(res.body.error.details.productName).toBeDefined();
  });
  it('rejects a quantity without a unit', async () => {
    const res = await as(app().post('/api/v1/sales').send({ ...sale, unit: null }));
    expect(res.status).toBe(400);
    expect(res.body.error.details.unit).toBeDefined();
  });
});

describe('dashboard', () => {
  it('is open to both roles and passes the chosen quarter along', async () => {
    fake.dashboardSummary.mockResolvedValue({ ok: true });
    for (const who of [staff, gm]) {
      fake.resolveSession.mockResolvedValue(who);
      expect((await as(app().get('/api/v1/dashboard/summary?year=2026&quarter=2'))).status).toBe(200);
    }
    expect(fake.dashboardSummary).toHaveBeenLastCalledWith(gm, { year: 2026, quarter: 2 });
  });
  it('rejects an impossible quarter', async () => {
    fake.resolveSession.mockResolvedValue(staff);
    expect((await as(app().get('/api/v1/dashboard/summary?quarter=5'))).status).toBe(400);
    expect((await as(app().get('/api/v1/dashboard/summary?year=1990'))).status).toBe(400);
  });
});