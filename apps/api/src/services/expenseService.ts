import { z } from 'zod';
import type {
  CreateExpenseInput, ExpenseList, ExpenseRecord, ListExpensesQuery, UpdateExpenseInput,
} from '@harvestgo/shared';
import type { AuthContext } from '../types.js';
import { assertCropUsable, withDateRange } from '../utils/cropCheck.js';
import { throwDbError } from '../utils/dbErrors.js';
import { describeEmbeds, embedded, withCropAndPerson } from '../utils/embeds.js';
import { HttpError } from '../utils/errors.js';

const SELECT = withCropAndPerson('id, crop_id, expense_date, description, amount');
const row = embedded.extend({
  id: z.string(),
  crop_id: z.string(),
  expense_date: z.string(),
  description: z.string(),
  amount: z.coerce.number(),
});

function toRecord(raw: unknown): ExpenseRecord {
  const r = row.parse(raw);
  return {
    id: r.id,
    cropId: r.crop_id,
    expenseDate: r.expense_date,
    description: r.description,
    amount: r.amount,
    ...describeEmbeds(r),
  };
}

export async function listExpenses(actor: AuthContext, f: ListExpensesQuery): Promise<ExpenseList> {
  const ascending = f.sort.endsWith('_asc');
  const by = f.sort.startsWith('amount') ? 'amount' : 'expense_date';
  const start = (f.page - 1) * f.pageSize;

  const { data, count, error } = await withDateRange(
    actor.db.from('expenses').select(SELECT, { count: 'exact' }),
    'expense_date',
    f,
  )
    .order(by, { ascending })
    .order('created_at', { ascending: false })
    .range(start, start + f.pageSize - 1);

  if (error) {
    if (error.code === 'PGRST103') {
      const head = await withDateRange(actor.db.from('expenses').select('id', { count: 'exact', head: true }), 'expense_date', f);
      return { records: [], total: head.count ?? 0, page: f.page, pageSize: f.pageSize };
    }
    throwDbError(error, 'Expenses');
  }
  return { records: (data ?? []).map(toRecord), total: count ?? 0, page: f.page, pageSize: f.pageSize };
}

export async function createExpense(actor: AuthContext, input: CreateExpenseInput): Promise<ExpenseRecord> {
  await assertCropUsable(actor, input.cropId);

  if (!input.confirmDuplicate) {
    const dup = await actor.db
      .from('expenses')
      .select('id')
      .eq('crop_id', input.cropId)
      .eq('expense_date', input.expenseDate)
      .eq('amount', input.amount)
      .eq('description', input.description)
      .limit(1);
    if (dup.error) throwDbError(dup.error, 'Expenses');
    if ((dup.data ?? []).length > 0) {
      throw new HttpError(409, 'DUPLICATE_SUSPECTED', 'An expense with the same crop, date, description and amount is already recorded.');
    }
  }

  const { data, error } = await actor.db
    .from('expenses')
    .insert({
      crop_id: input.cropId,
      expense_date: input.expenseDate,
      description: input.description,
      amount: input.amount,
      created_by: actor.userId, // always the real logged-in person
    })
    .select(SELECT)
    .single();
  if (error) throwDbError(error, 'Expense');
  return toRecord(data);
}

export async function updateExpense(actor: AuthContext, id: string, input: UpdateExpenseInput): Promise<ExpenseRecord> {
  const found = await actor.db.from('expenses').select('id, created_by, crop_id').eq('id', id).maybeSingle();
  if (found.error) throwDbError(found.error, 'Expense');
  if (!found.data) throw new HttpError(404, 'NOT_FOUND', 'Expense not found.');
  if (actor.role !== 'general_manager' && found.data.created_by !== actor.userId) {
    throw new HttpError(403, 'FORBIDDEN', 'You can only edit records you entered yourself.');
  }
  if (input.cropId !== found.data.crop_id) await assertCropUsable(actor, input.cropId);

  const { data, error } = await actor.db
    .from('expenses')
    .update({ crop_id: input.cropId, expense_date: input.expenseDate, description: input.description, amount: input.amount })
    .eq('id', id)
    .select(SELECT)
    .maybeSingle();
  if (error) throwDbError(error, 'Expense');
  if (!data) throw new HttpError(403, 'FORBIDDEN', 'You can only edit records you entered yourself.');
  return toRecord(data);
}

export async function deleteExpense(actor: AuthContext, id: string): Promise<void> {
  const { data, error } = await actor.db.from('expenses').delete().eq('id', id).select('id');
  if (error) throwDbError(error, 'Expense');
  if (!data || data.length === 0) throw new HttpError(404, 'NOT_FOUND', 'Expense not found.');
}