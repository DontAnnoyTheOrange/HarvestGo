import { describe, expect, it } from 'vitest';
import {
  createExpenseSchema, createSaleSchema, currentQuarterInManila, quarterRange, updateSaleSchema,
} from '@harvestgo/shared';

const crop = '3f2a4d3e-6a52-4b52-9a4e-1c2d3e4f5a6b';
const expense = { cropId: crop, expenseDate: '2026-06-10', description: 'Substrate', amount: 198.25 };
const sale = { cropId: crop, saleDate: '2026-06-10', saleType: 'raw', amount: 4958 };

describe('expense rules', () => {
  it('accepts a normal expense', () => expect(createExpenseSchema.safeParse(expense).success).toBe(true));
  it.each([
    ['zero', { amount: 0 }],
    ['negative', { amount: -5 }],
    ['three decimals', { amount: 1.005 }],
    ['not a number', { amount: Number.NaN }],
    ['blank description', { description: '   ' }],
    ['future date', { expenseDate: '2999-01-01' }],
    ['bad crop', { cropId: 'x' }],
  ])('rejects %s', (_l, bad) => expect(createExpenseSchema.safeParse({ ...expense, ...bad }).success).toBe(false));
});

describe('sale rules', () => {
  it('accepts a raw sale with no product name, and a zero amount', () => {
    expect(createSaleSchema.safeParse(sale).success).toBe(true);
    expect(createSaleSchema.safeParse({ ...sale, amount: 0 }).success).toBe(true);
  });

  it('turns blanks into null', () => {
    const r = createSaleSchema.safeParse({ ...sale, productName: '  ', quantity: null, unit: null });
    expect(r.success && r.data.productName === null && r.data.quantity === null).toBe(true);
  });

  it('requires a product name for value-added sales', () => {
    const r = createSaleSchema.safeParse({ ...sale, saleType: 'value_added' });
    expect(r.success).toBe(false);
    expect(createSaleSchema.safeParse({ ...sale, saleType: 'value_added', productName: 'Mushroom Chips' }).success).toBe(true);
  });

  it('needs quantity and unit together', () => {
    expect(createSaleSchema.safeParse({ ...sale, quantity: 5 }).success).toBe(false);
    expect(createSaleSchema.safeParse({ ...sale, unit: 'kg' }).success).toBe(false);
    expect(createSaleSchema.safeParse({ ...sale, quantity: 5, unit: 'kg' }).success).toBe(true);
  });

  it('rejects a negative amount, too many decimals, and unknown types', () => {
    expect(createSaleSchema.safeParse({ ...sale, amount: -1 }).success).toBe(false);
    expect(createSaleSchema.safeParse({ ...sale, amount: 10.999 }).success).toBe(false);
    expect(createSaleSchema.safeParse({ ...sale, saleType: 'gift' }).success).toBe(false);
  });

  it('applies the same rules when editing', () => {
    expect(updateSaleSchema.safeParse({ ...sale, saleType: 'value_added' }).success).toBe(false);
  });
});

describe('quarters', () => {
  it('knows where each quarter starts and ends', () => {
    expect(quarterRange(2026, 1)).toEqual({ from: '2026-01-01', to: '2026-03-31' });
    expect(quarterRange(2026, 2)).toEqual({ from: '2026-04-01', to: '2026-06-30' });
    expect(quarterRange(2026, 3)).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    expect(quarterRange(2026, 4)).toEqual({ from: '2026-10-01', to: '2026-12-31' });
  });
  it('knows the current quarter', () => {
    const q = currentQuarterInManila();
    expect(q.quarter).toBeGreaterThanOrEqual(1);
    expect(q.quarter).toBeLessThanOrEqual(4);
  });
});