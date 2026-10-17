'use client';

import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import {
  SALE_TYPES, SALE_TYPE_LABELS, UNITS, UNIT_LABELS, createSaleSchema, todayInManila, updateSaleSchema,
  type Crop, type SaleRecord, type SaleType, type Unit,
} from '@harvestgo/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dialog, inputClass, primaryButton, secondaryButton } from './Dialog';

type Field = 'cropId' | 'saleDate' | 'saleType' | 'productName' | 'quantity' | 'unit' | 'amount';

export function SaleFormDialog({ record, crops, onSaved, onClose }: {
  record?: SaleRecord; crops: Crop[]; onSaved: (message: string) => void; onClose: () => void;
}) {
  const editing = !!record;
  const [cropId, setCropId] = useState(record?.cropId ?? '');
  const [saleDate, setSaleDate] = useState(record?.saleDate ?? todayInManila());
  const [saleType, setSaleType] = useState<SaleType>(record?.saleType ?? 'raw');
  const [productName, setProductName] = useState(record?.productName ?? '');
  const [amount, setAmount] = useState(record ? String(record.amount) : '');
  const [quantity, setQuantity] = useState(record?.quantity != null ? String(record.quantity) : '');
  const [unit, setUnit] = useState<Unit | ''>(record?.unit ?? '');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);

  const usable = crops.filter((c) => c.isActive || c.id === record?.cropId);
  const groups = [...new Set(usable.map((c) => c.categoryName))];

  async function save(confirmDuplicate: boolean) {
    setFormError(null);
    const payload = {
      cropId, saleDate, saleType,
      productName,
      quantity: quantity.trim() === '' ? null : Number(quantity),
      unit: unit === '' ? null : unit,
      amount: amount.trim() === '' ? Number.NaN : Number(amount),
    };
    const check = editing
      ? updateSaleSchema.safeParse(payload)
      : createSaleSchema.safeParse(confirmDuplicate ? { ...payload, confirmDuplicate: true } : payload);
    if (!check.success) {
      const f = z.flattenError(check.error).fieldErrors as Record<string, string[] | undefined>;
      setErrors(Object.fromEntries((Object.keys(f) as Field[]).map((k) => [k, f[k]?.[0]])));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (editing) await apiFetch(`/sales/${record.id}`, { method: 'PUT', json: check.data });
      else await apiFetch('/sales', { method: 'POST', json: check.data });
      onSaved(editing ? 'Sale updated.' : 'Sale recorded.');
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'DUPLICATE_SUSPECTED') setDuplicate(true);
      else if (err instanceof ApiRequestError) {
        const d = err.details ?? {};
        setErrors(Object.fromEntries(Object.keys(d).map((k) => [k, d[k]?.[0]])));
        setFormError(err.message);
      } else setFormError('Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  const a11y = (id: Field) => ({ 'aria-invalid': !!errors[id], 'aria-describedby': errors[id] ? `${id}-error` : undefined });
  const err = (id: Field) => (errors[id] ? <p id={`${id}-error`} className="mt-1 text-sm text-red-700">{errors[id]}</p> : null);

  return (
    <Dialog title={editing ? 'Edit sale' : 'Record a sale'} onClose={onClose}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); setDuplicate(false); void save(false); }} noValidate className="space-y-4">
        {formError && <p role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm font-medium text-red-900">{formError}</p>}
        {duplicate && (
          <div role="alert" className="rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">This looks like a duplicate.</p>
            <p>A sale with the same crop, date, type and amount is already recorded. Save it anyway?</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => { setDuplicate(false); void save(true); }} className={primaryButton}>Save anyway</button>
              <button type="button" onClick={() => setDuplicate(false)} className={secondaryButton}>Go back and check</button>
            </div>
          </div>
        )}

        <div>
          <label htmlFor="cropId" className="block text-sm font-semibold">Crop *</label>
          <select id="cropId" value={cropId} onChange={(e) => setCropId(e.target.value)} className={inputClass} {...a11y('cropId')}>
            <option value="">Choose a crop...</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {usable.filter((c) => c.categoryName === g).map((c) => <option key={c.id} value={c.id}>{c.name}{c.isActive ? '' : ' (switched off)'}</option>)}
              </optgroup>
            ))}
          </select>
          {usable.length === 0 && <p className="mt-1 text-sm text-amber-800">There are no crops yet. Ask the General Manager to add them.</p>}
          {err('cropId')}
        </div>

        <div>
          <label htmlFor="saleDate" className="block text-sm font-semibold">Date *</label>
          <input id="saleDate" type="date" value={saleDate} max={todayInManila()} onChange={(e) => setSaleDate(e.target.value)} className={inputClass} {...a11y('saleDate')} />
          {err('saleDate')}
        </div>

        <fieldset>
          <legend className="text-sm font-semibold">What was sold? *</legend>
          <div className="mt-1 flex flex-wrap gap-4">
            {SALE_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <input type="radio" name="saleType" value={t} checked={saleType === t} onChange={() => setSaleType(t)} /> {SALE_TYPE_LABELS[t]}
              </label>
            ))}
          </div>
          {err('saleType')}
        </fieldset>

        <div>
          <label htmlFor="productName" className="block text-sm font-semibold">
            Product name {saleType === 'value_added' ? '*' : '(optional)'}
          </label>
          <input id="productName" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder={saleType === 'value_added' ? 'e.g. Mushroom Chips' : 'e.g. Fresh mushrooms'} className={inputClass} autoComplete="off" {...a11y('productName')} />
          {err('productName')}
        </div>

        <div>
          <label htmlFor="amount" className="block text-sm font-semibold">Amount received (PHP) *</label>
          <input id="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 4958" className={inputClass} autoComplete="off" {...a11y('amount')} />
          {err('amount')}
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="quantity" className="block text-sm font-semibold">Quantity sold (optional)</label>
            <input id="quantity" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} autoComplete="off" {...a11y('quantity')} />
            {err('quantity')}
          </div>
          <div className="w-28">
            <label htmlFor="unit" className="block text-sm font-semibold">Unit</label>
            <select id="unit" value={unit} onChange={(e) => setUnit(e.target.value as Unit | '')} className={inputClass} {...a11y('unit')}>
              <option value="">None</option>
              {UNITS.map((u) => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
            </select>
            {err('unit')}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={busy} className={primaryButton}>{busy ? 'Saving...' : 'Save'}</button>
        </div>
      </form>
    </Dialog>
  );
}