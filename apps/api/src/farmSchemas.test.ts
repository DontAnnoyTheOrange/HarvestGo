import { describe, expect, it } from 'vitest';
import { createHarvestSchema, isValidIsoDate, todayInManila, updateHarvestSchema } from '@harvestgo/shared';

const crop = '3f2a4d3e-6a52-4b52-9a4e-1c2d3e4f5a6b';
const ok = { cropId: crop, harvestDate: '2026-06-10', quantity: 30.986, unit: 'kg' };

describe('harvest rules (shared by the screen and the server)', () => {
  it('accepts a normal record, with three decimals and blank notes', () => {
    const r = createHarvestSchema.safeParse({ ...ok, notes: '   ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.notes).toBeNull();
  });

  it('accepts pieces and grams', () => {
    expect(createHarvestSchema.safeParse({ ...ok, quantity: 45, unit: 'pcs' }).success).toBe(true);
    expect(createHarvestSchema.safeParse({ ...ok, quantity: 800, unit: 'g' }).success).toBe(true);
  });

  it.each([
    ['zero', { quantity: 0 }],
    ['negative', { quantity: -2 }],
    ['four decimals', { quantity: 1.2345 }],
    ['not a number', { quantity: Number.NaN }],
    ['too large', { quantity: 1_000_000 }],
    ['unknown unit', { unit: 'tons' }],
    ['not a real date', { harvestDate: '2026-02-30' }],
    ['wrong date format', { harvestDate: '10/06/2026' }],
    ['far past', { harvestDate: '1999-01-01' }],
    ['future', { harvestDate: '2999-01-01' }],
    ['bad crop id', { cropId: 'mushroom' }],
  ])('rejects %s', (_label, bad) => {
    expect(createHarvestSchema.safeParse({ ...ok, ...bad }).success).toBe(false);
  });

  it('accepts today but not tomorrow', () => {
    expect(createHarvestSchema.safeParse({ ...ok, harvestDate: todayInManila() }).success).toBe(true);
  });

  it('refuses an empty edit but allows a single changed field', () => {
    expect(updateHarvestSchema.safeParse({}).success).toBe(false);
    expect(updateHarvestSchema.safeParse({ quantity: 5 }).success).toBe(true);
  });

  it('knows real calendar dates', () => {
    expect(isValidIsoDate('2028-02-29')).toBe(true); // leap year
    expect(isValidIsoDate('2027-02-29')).toBe(false);
  });
});