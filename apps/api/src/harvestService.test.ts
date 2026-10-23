import { describe, expect, it, vi } from 'vitest';
import { createHarvest, deleteHarvest, updateHarvest } from './services/harvestService.js';

/** A pretend database call: any chain of .select().eq()... finally resolves to `result`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chain(result: unknown): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = new Proxy({}, { get: (_t, prop) => (prop === 'then' ? (res: (v: unknown) => void) => res(result) : () => c) });
  return c;
}
/** db.from() hands out the prepared answers in order, one per query the service makes. */
function fakeDb(...answers: unknown[]) {
  const from = vi.fn();
  for (const a of answers) from.mockReturnValueOnce(chain(a));
  return { from };
}
const actor = (role: string, userId: string, db: unknown) => ({ userId, role, db }) as never;
const crop = '3f2a4d3e-6a52-4b52-9a4e-1c2d3e4f5a6b';
const input = { cropId: crop, harvestDate: '2026-06-10', quantity: 5, unit: 'kg', notes: null } as const;
const savedRow = {
  id: 'r1', crop_id: crop, harvest_date: '2026-06-10', quantity: 5, unit: 'kg', notes: null,
  created_by: 'u1', created_at: '2026-06-10T00:00:00Z',
  crops: { name: 'Mushroom', crop_categories: { name: 'Vegetables' } }, profiles: { full_name: 'Staff Bee' },
};

describe('createHarvest', () => {
  it('warns about a likely duplicate instead of saving', async () => {
    const db = fakeDb({ data: { id: crop, is_active: true }, error: null }, { data: [{ id: 'old' }], error: null });
    await expect(createHarvest(actor('administrative_staff', 'u1', db), input)).rejects.toMatchObject({ status: 409, code: 'DUPLICATE_SUSPECTED' });
    expect(db.from).toHaveBeenCalledTimes(2); // crop check + duplicate check, no insert
  });

  it('saves when the person confirms the duplicate, stamped with their own id', async () => {
    const db = fakeDb({ data: { id: crop, is_active: true }, error: null }, { data: savedRow, error: null });
    const rec = await createHarvest(actor('administrative_staff', 'u1', db), { ...input, confirmDuplicate: true });
    expect(rec).toMatchObject({ cropName: 'Mushroom', categoryName: 'Vegetables', createdByName: 'Staff Bee', quantity: 5 });
  });

  it('refuses a switched-off crop', async () => {
    const db = fakeDb({ data: { id: crop, is_active: false }, error: null });
    await expect(createHarvest(actor('administrative_staff', 'u1', db), input)).rejects.toMatchObject({ status: 400, details: { cropId: expect.any(Array) } });
  });

  it('refuses a crop that does not exist', async () => {
    const db = fakeDb({ data: null, error: null });
    await expect(createHarvest(actor('administrative_staff', 'u1', db), input)).rejects.toMatchObject({ status: 400 });
  });
});

describe('updateHarvest', () => {
  it('404 when the record does not exist', async () => {
    const db = fakeDb({ data: null, error: null });
    await expect(updateHarvest(actor('general_manager', 'gm', db), 'r1', { quantity: 9 })).rejects.toMatchObject({ status: 404 });
  });

  it("stops Staff from editing someone else's record before touching it", async () => {
    const db = fakeDb({ data: { id: 'r1', created_by: 'other', crop_id: crop }, error: null });
    await expect(updateHarvest(actor('administrative_staff', 'u1', db), 'r1', { quantity: 9 })).rejects.toMatchObject({ status: 403 });
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it('lets Staff edit their own record', async () => {
    const db = fakeDb({ data: { id: 'r1', created_by: 'u1', crop_id: crop }, error: null }, { data: { ...savedRow, quantity: 9 }, error: null });
    expect((await updateHarvest(actor('administrative_staff', 'u1', db), 'r1', { quantity: 9 })).quantity).toBe(9);
  });

  it('lets the General Manager edit anyone\'s record', async () => {
    const db = fakeDb({ data: { id: 'r1', created_by: 'other', crop_id: crop }, error: null }, { data: savedRow, error: null });
    await expect(updateHarvest(actor('general_manager', 'gm', db), 'r1', { notes: null })).resolves.toBeDefined();
  });

  it('reports 403 if the database rules block the change', async () => {
    const db = fakeDb({ data: { id: 'r1', created_by: 'u1', crop_id: crop }, error: null }, { data: null, error: null });
    await expect(updateHarvest(actor('administrative_staff', 'u1', db), 'r1', { quantity: 9 })).rejects.toMatchObject({ status: 403 });
  });
});

describe('deleteHarvest', () => {
  it('404 if nothing was deleted', async () => {
    const db = fakeDb({ data: [], error: null });
    await expect(deleteHarvest(actor('general_manager', 'gm', db), 'r1')).rejects.toMatchObject({ status: 404 });
  });
  it('succeeds when a row was removed', async () => {
    const db = fakeDb({ data: [{ id: 'r1' }], error: null });
    await expect(deleteHarvest(actor('general_manager', 'gm', db), 'r1')).resolves.toBeUndefined();
  });
});