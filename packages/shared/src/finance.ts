import { z } from 'zod';
import { todayInManila, unitSchema } from './farm.js';

// ---------------- Dates: quarters ----------------
export const QUARTERS = [1, 2, 3, 4] as const;
export type Quarter = (typeof QUARTERS)[number];

/** First and last day of a quarter, as YYYY-MM-DD. Q1 = Jan-Mar ... Q4 = Oct-Dec. */
export function quarterRange(year: number, quarter: number): { from: string; to: string } {
  const lastDay = [31, 30, 30, 31] as const; // Mar, Jun, Sep, Dec
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const pad = (n: number) => String(n).padStart(2, '0');
  return { from: `${year}-${pad(startMonth)}-01`, to: `${year}-${pad(endMonth)}-${lastDay[quarter - 1] ?? 31}` };
}

/** The quarter we are in today (Philippine time). */
export function currentQuarterInManila(): { year: number; quarter: Quarter } {
  const [y, m] = todayInManila().split('-').map(Number);
  return { year: y ?? 2026, quarter: (Math.ceil((m ?? 1) / 3) as Quarter) };
}

// ---------------- Dates and money (shared building blocks) ----------------
const isoDate = z
  .string({ error: 'Enter a valid date.' })
  .refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s, {
    error: 'Enter a valid date.',
  })
  .refine((s) => s >= '2020-01-01', { error: 'That date is too far in the past.' });

const pastOrToday = isoDate.refine((s) => s <= todayInManila(), { error: 'The date cannot be in the future.' });

const twoDecimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
const threeDecimals = (n: number) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6;

/** Expense amount in pesos: more than 0. */
const expenseAmount = z
  .number({ error: 'Enter an amount.' })
  .positive({ error: 'The amount must be more than 0.' })
  .max(9_999_999_999.99, { error: 'That amount is too large.' })
  .refine(twoDecimals, { error: 'Use at most 2 decimal places (centavos).' });

/** Sale amount in pesos: 0 or more. */
const saleAmount = z
  .number({ error: 'Enter an amount.' })
  .min(0, { error: 'The amount cannot be negative.' })
  .max(9_999_999_999.99, { error: 'That amount is too large.' })
  .refine(twoDecimals, { error: 'Use at most 2 decimal places (centavos).' });

const optionalText = (max: number, tooLong: string) =>
  z.string().trim().max(max, { error: tooLong }).nullish().transform((v) => (v ? v : null));

const SORTS = ['date_desc', 'date_asc', 'amount_desc', 'amount_asc'] as const;
export const MONEY_SORTS = SORTS;
export type MoneySort = (typeof SORTS)[number];

// ---------------- Expenses (ATI Section B) ----------------
const expenseFields = z.object({
  cropId: z.uuid({ error: 'Choose a crop.' }),
  expenseDate: pastOrToday,
  description: z
    .string({ error: 'Describe what the money was spent on.' })
    .trim()
    .min(1, { error: 'Describe what the money was spent on.' })
    .max(200, { error: 'The description is too long (200 characters max).' }),
  amount: expenseAmount,
});

export const createExpenseSchema = expenseFields.extend({ confirmDuplicate: z.boolean().optional() });
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
/** Editing sends the whole record again. */
export const updateExpenseSchema = expenseFields;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const listExpensesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  cropId: z.uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(SORTS).default('date_desc'),
});
export type ListExpensesQuery = z.infer<typeof listExpensesQuery>;

export const expenseRecordSchema = z.object({
  id: z.string(),
  cropId: z.string(),
  cropName: z.string(),
  categoryName: z.string(),
  expenseDate: z.string(),
  description: z.string(),
  amount: z.number(),
  createdBy: z.string(),
  createdByName: z.string(),
  createdAt: z.string(),
});
export type ExpenseRecord = z.infer<typeof expenseRecordSchema>;
export const expenseListSchema = z.object({
  records: z.array(expenseRecordSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type ExpenseList = z.infer<typeof expenseListSchema>;

// ---------------- Sales (ATI Sections C and D) ----------------
export const SALE_TYPES = ['raw', 'value_added'] as const;
export const saleTypeSchema = z.enum(SALE_TYPES, { error: 'Choose raw produce or value-added.' });
export type SaleType = z.infer<typeof saleTypeSchema>;
export const SALE_TYPE_LABELS: Record<SaleType, string> = { raw: 'Raw produce', value_added: 'Value-added product' };

const saleBase = z.object({
  cropId: z.uuid({ error: 'Choose a crop.' }),
  saleDate: pastOrToday,
  saleType: saleTypeSchema,
  productName: optionalText(100, 'The product name is too long (100 characters max).'),
  quantity: z
    .number({ error: 'Enter a number.' })
    .positive({ error: 'The amount must be more than 0.' })
    .max(999999.999, { error: 'That number is too large.' })
    .refine(threeDecimals, { error: 'Use at most 3 decimal places.' })
    .nullish()
    .transform((v) => v ?? null),
  unit: unitSchema.nullish().transform((v) => v ?? null),
  amount: saleAmount,
});

type SaleCheck = {
  saleType: SaleType;
  productName: string | null;
  quantity: number | null;
  unit: string | null;
};
/** Rules that involve more than one field (the database enforces the same ones). */
function saleRules(v: SaleCheck, ctx: z.RefinementCtx) {
  if (v.saleType === 'value_added' && !v.productName) {
    ctx.addIssue({ code: 'custom', path: ['productName'], message: 'Enter the product name, for example Mushroom Chips.' });
  }
  if (v.quantity !== null && v.unit === null) {
    ctx.addIssue({ code: 'custom', path: ['unit'], message: 'Choose a unit for the quantity.' });
  }
  if (v.quantity === null && v.unit !== null) {
    ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Enter the quantity, or clear the unit.' });
  }
}

export const createSaleSchema = saleBase.extend({ confirmDuplicate: z.boolean().optional() }).superRefine(saleRules);
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export const updateSaleSchema = saleBase.superRefine(saleRules);
export type UpdateSaleInput = z.infer<typeof updateSaleSchema>;

export const listSalesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  cropId: z.uuid().optional(),
  saleType: saleTypeSchema.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(SORTS).default('date_desc'),
});
export type ListSalesQuery = z.infer<typeof listSalesQuery>;

export const saleRecordSchema = z.object({
  id: z.string(),
  cropId: z.string(),
  cropName: z.string(),
  categoryName: z.string(),
  saleDate: z.string(),
  saleType: saleTypeSchema,
  productName: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: unitSchema.nullable(),
  amount: z.number(),
  createdBy: z.string(),
  createdByName: z.string(),
  createdAt: z.string(),
});
export type SaleRecord = z.infer<typeof saleRecordSchema>;
export const saleListSchema = z.object({
  records: z.array(saleRecordSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type SaleList = z.infer<typeof saleListSchema>;

// ---------------- Dashboard ----------------
export const dashboardQuery = z.object({
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  quarter: z.coerce.number().int().min(1).max(4).optional(),
});

export const dashboardSummarySchema = z.object({
  period: z.object({ year: z.number(), quarter: z.number(), from: z.string(), to: z.string() }),
  harvest: z.object({ totalKg: z.number(), totalPcs: z.number(), records: z.number() }),
  sales: z.object({ raw: z.number(), valueAdded: z.number(), total: z.number() }),
  expenses: z.object({ total: z.number() }),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;