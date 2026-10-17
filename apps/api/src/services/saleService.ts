import { z } from 'zod';
import { saleTypeSchema, unitSchema } from '@harvestgo/shared';
import type { CreateSaleInput, ListSalesQuery, SaleList, SaleRecord, UpdateSaleInput } from '@harvestgo/shared';
import type { AuthContext } from '../types.js';
import { assertCropUsable, withDateRange } from '../utils/cropCheck.js';
import { throwDbError } from '../utils/dbErrors.js';
import { describeEmbeds, embedded, withCropAndPerson } from '../utils/embeds.js';
import { HttpError } from '../utils/errors.js';

const SELECT = withCropAndPerson('id, crop_id, sale_date, sale_type, product_name, quantity, unit, amount');
const row = embedded.extend({
  id: z.string(),
  crop_id: z.string(),
  sale_date: z.string(),
  sale_type: saleTypeSchema,
  product_name: z.string().nullable(),
  quantity: z.coerce.number().nullable(),
  unit: unitSchema.nullable(),
  amount: z.coerce.number(),
});

function toRecord(raw: unknown): SaleRecord {
  const r = row.parse(raw);
  return {
    id: r.id,
    cropId: r.crop_id,
    saleDate: r.sale_date,
    saleType: r.sale_type,
    productName: r.product_name,
    quantity: r.quantity,
    unit: r.unit,
    amount: r.amount,
    ...describeEmbeds(r),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filtered<Q>(query: Q, f: ListSalesQuery): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = withDateRange(query, 'sale_date', f);
  if (f.saleType) q = q.eq('sale_type', f.saleType);
  return q as Q;
}

export async function listSales(actor: AuthContext, f: ListSalesQuery): Promise<SaleList> {
  const ascending = f.sort.endsWith('_asc');
  const by = f.sort.startsWith('amount') ? 'amount' : 'sale_date';
  const start = (f.page - 1) * f.pageSize;

  const { data, count, error } = await filtered(actor.db.from('sales_records').select(SELECT, { count: 'exact' }), f)
    .order(by, { ascending })
    .order('created_at', { ascending: false })
    .range(start, start + f.pageSize - 1);

  if (error) {
    if (error.code === 'PGRST103') {
      const head = await filtered(actor.db.from('sales_records').select('id', { count: 'exact', head: true }), f);
      return { records: [], total: head.count ?? 0, page: f.page, pageSize: f.pageSize };
    }
    throwDbError(error, 'Sales');
  }
  return { records: (data ?? []).map(toRecord), total: count ?? 0, page: f.page, pageSize: f.pageSize };
}

export async function createSale(actor: AuthContext, input: CreateSaleInput): Promise<SaleRecord> {
  await assertCropUsable(actor, input.cropId);

  if (!input.confirmDuplicate) {
    let q = actor.db
      .from('sales_records')
      .select('id')
      .eq('crop_id', input.cropId)
      .eq('sale_date', input.saleDate)
      .eq('sale_type', input.saleType)
      .eq('amount', input.amount);
    q = input.productName === null ? q.is('product_name', null) : q.eq('product_name', input.productName);
    const dup = await q.limit(1);
    if (dup.error) throwDbError(dup.error, 'Sales');
    if ((dup.data ?? []).length > 0) {
      throw new HttpError(409, 'DUPLICATE_SUSPECTED', 'A sale with the same crop, date, type and amount is already recorded.');
    }
  }

  const { data, error } = await actor.db
    .from('sales_records')
    .insert({
      crop_id: input.cropId,
      sale_date: input.saleDate,
      sale_type: input.saleType,
      product_name: input.productName,
      quantity: input.quantity,
      unit: input.unit,
      amount: input.amount,
      created_by: actor.userId, // always the real logged-in person
    })
    .select(SELECT)
    .single();
  if (error) throwDbError(error, 'Sale');
  return toRecord(data);
}

export async function updateSale(actor: AuthContext, id: string, input: UpdateSaleInput): Promise<SaleRecord> {
  const found = await actor.db.from('sales_records').select('id, created_by, crop_id').eq('id', id).maybeSingle();
  if (found.error) throwDbError(found.error, 'Sale');
  if (!found.data) throw new HttpError(404, 'NOT_FOUND', 'Sale not found.');
  if (actor.role !== 'general_manager' && found.data.created_by !== actor.userId) {
    throw new HttpError(403, 'FORBIDDEN', 'You can only edit records you entered yourself.');
  }
  if (input.cropId !== found.data.crop_id) await assertCropUsable(actor, input.cropId);

  const { data, error } = await actor.db
    .from('sales_records')
    .update({
      crop_id: input.cropId,
      sale_date: input.saleDate,
      sale_type: input.saleType,
      product_name: input.productName,
      quantity: input.quantity,
      unit: input.unit,
      amount: input.amount,
    })
    .eq('id', id)
    .select(SELECT)
    .maybeSingle();
  if (error) throwDbError(error, 'Sale');
  if (!data) throw new HttpError(403, 'FORBIDDEN', 'You can only edit records you entered yourself.');
  return toRecord(data);
}

export async function deleteSale(actor: AuthContext, id: string): Promise<void> {
  const { data, error } = await actor.db.from('sales_records').delete().eq('id', id).select('id');
  if (error) throwDbError(error, 'Sale');
  if (!data || data.length === 0) throw new HttpError(404, 'NOT_FOUND', 'Sale not found.');
}