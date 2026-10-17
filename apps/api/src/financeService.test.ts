import { describe, expect, it, vi } from 'vitest';
import { createExpense, deleteExpense, updateExpense } from './services/expenseService.js';
import { createSale, updateSale } from './services/saleService.js';
import { dashboardSummary } from './services/dashboardService.js';

/** A pretend database call: any chain of .select().eq()... finally resolves to `result`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chain(result: unknown): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = new Proxy({}, { get: (_t, prop) => (prop === 'then' ? (res: (v: unknown) => void) => res(result) : () => c) });
  return c;
}
function fakeDb(...answers: unknown[]) {
  const from = vi.fn();
  for (const a of answers) from.mockReturnValueOnce(chain(a));
  return { from };
}
const actor = (role: string, userId: string, db: unknown) => ({ userId, role, db }) as never;
const crop = '3f2a4d3e-6a52-4b52-9a4e-1c2d3e4f5a6b';
const embeds = { created_by: 'u1', created_at: '2026-06-10T00:00:00Z', crops: { name: 'Mushroom', crop_categories: { name: 'Vegetables' } }, profiles: { full_name: 'Staff Bee' } };
const okCrop = { data: { id: crop, is_active: true }, error: null };

const expenseIn = { cropId: crop, expenseDate: '2026-06-10', description: 'Substrate', amount: 198.25 };
const expenseRow = { id: 'e1', crop_id: crop, expense_date: '2026-06-10', description: 'Substrate', amount: '198.25', ...embeds };
const saleIn = { cropId: crop, saleDate: '2026-06-10', saleType: 'value_added', productName: 'Mushroom Chips', quantity: null, unit: null, amount: 3052.5 } as const;
const saleRow = { id: 's1', crop_id: crop, sale_date: '2026-06-10', sale_type: 'value_added', product_name: 'Mushroom Chips', quantity: null, unit: null, amount: 3052.5, ...embeds };

describe('expenses', () => {
  it('warns about a likely duplicate instead of saving', async () => {
    const db = fakeDb(okCrop, { data: [{ id: 'old' }], error: null });
    await expect(createExpense(actor('administrative_staff', 'u1', db), expenseIn)).rejects.toMatchObject({ status: 409, code: 'DUPLICATE_SUSPECTED' });
    expect(db.from).toHaveBeenCalledTimes(2);
  });
  it('saves after confirmation and reads amounts as numbers', async () => {
    const db = fakeDb(okCrop, { data: expenseRow, error: null });
    const rec = await createExpense(actor('administrative_staff', 'u1', db), { ...expenseIn, confirmDuplicate: true });
    expect(rec).toMatchObject({ amount: 198.25, cropName: 'Mushroom', categoryName: 'Vegetables', createdByName: 'Staff Bee' });
  });
  it('refuses a switched-off crop', async () => {
    const db = fakeDb({ data: { id: crop, is_active: false }, error: null });
    await expect(createExpense(actor('administrative_staff', 'u1', db), expenseIn)).rejects.toMatchObject({ status: 400 });
  });
  it("stops Staff editing someone else's expense before touching it", async () => {
    const db = fakeDb({ data: { id: 'e1', created_by: 'other', crop_id: crop }, error: null });
    await expect(updateExpense(actor('administrative_staff', 'u1', db), 'e1', expenseIn)).rejects.toMatchObject({ status: 403 });
    expect(db.from).toHaveBeenCalledTimes(1);
  });
  it('404 when editing or deleting something that is not there', async () => {
    await expect(updateExpense(actor('general_manager', 'gm', fakeDb({ data: null, error: null })), 'e1', expenseIn)).rejects.toMatchObject({ status: 404 });
    await expect(deleteExpense(actor('general_manager', 'gm', fakeDb({ data: [], error: null })), 'e1')).rejects.toMatchObject({ status: 404 });
  });
});

describe('sales', () => {
  it('warns about a duplicate sale', async () => {
    const db = fakeDb(okCrop, { data: [{ id: 'old' }], error: null });
    await expect(createSale(actor('administrative_staff', 'u1', db), saleIn)).rejects.toMatchObject({ status: 409 });
  });
  it('saves a value-added sale', async () => {
    const db = fakeDb(okCrop, { data: [], error: null }, { data: saleRow, error: null });
    const rec = await createSale(actor('administrative_staff', 'u1', db), saleIn);
    expect(rec).toMatchObject({ saleType: 'value_added', productName: 'Mushroom Chips', amount: 3052.5, quantity: null });
  });
  it('lets the Manager edit anyone, and Staff only their own', async () => {
    const mine = fakeDb({ data: { id: 's1', created_by: 'u1', crop_id: crop }, error: null }, { data: saleRow, error: null });
    await expect(updateSale(actor('administrative_staff', 'u1', mine), 's1', saleIn)).resolves.toBeDefined();
    const theirs = fakeDb({ data: { id: 's1', created_by: 'other', crop_id: crop }, error: null });
    await expect(updateSale(actor('administrative_staff', 'u1', theirs), 's1', saleIn)).rejects.toMatchObject({ status: 403 });
    const manager = fakeDb({ data: { id: 's1', created_by: 'other', crop_id: crop }, error: null }, { data: saleRow, error: null });
    await expect(updateSale(actor('general_manager', 'gm', manager), 's1', saleIn)).resolves.toBeDefined();
  });
});

describe('dashboard totals', () => {
  const rpc = (data: unknown, error: unknown = null) => ({ rpc: vi.fn().mockResolvedValue({ data, error }) });

  it('builds the quarter, rounds, and adds raw + value-added for gross revenue', async () => {
    const db = rpc({ harvest_kg: '31.78600000000000000000', harvest_pcs: '45.000', harvest_records: 3, sales_raw: '4958.00', sales_value_added: '3052.50', expenses_total: '260.75' });
    const out = await dashboardSummary(actor('administrative_staff', 'u1', db), { year: 2026, quarter: 2 });
    expect(db.rpc).toHaveBeenCalledWith('dashboard_summary', { p_from: '2026-04-01', p_to: '2026-06-30' });
    expect(out).toEqual({
      period: { year: 2026, quarter: 2, from: '2026-04-01', to: '2026-06-30' },
      harvest: { totalKg: 31.786, totalPcs: 45, records: 3 },
      sales: { raw: 4958, valueAdded: 3052.5, total: 8010.5 },
      expenses: { total: 260.75 },
    });
  });

  it('handles an empty quarter', async () => {
    const db = rpc({ harvest_kg: 0, harvest_pcs: 0, harvest_records: 0, sales_raw: 0, sales_value_added: 0, expenses_total: 0 });
    const out = await dashboardSummary(actor('general_manager', 'gm', db), { year: 2025, quarter: 1 });
    expect(out.sales.total).toBe(0);
  });

  it('reports a database problem as unavailable instead of showing zeros', async () => {
    const db = rpc(null, { code: 'PGRST202', message: 'function not found' });
    await expect(dashboardSummary(actor('general_manager', 'gm', db), { year: 2026, quarter: 2 })).rejects.toMatchObject({ status: 503 });
  });
});