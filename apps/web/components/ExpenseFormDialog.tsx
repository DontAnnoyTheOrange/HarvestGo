'use client';

import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { createExpenseSchema, todayInManila, updateExpenseSchema, type Crop, type ExpenseRecord } from '@harvestgo/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dialog, inputClass, primaryButton, secondaryButton } from './Dialog';

type Field = 'cropId' | 'expenseDate' | 'description' | 'amount';

export function ExpenseFormDialog({ record, crops, onSaved, onClose }: {
  record?: ExpenseRecord; crops: Crop[]; onSaved: (message: string) => void; onClose: () => void;
}) {
  const editing = !!record;
  const [cropId, setCropId] = useState(record?.cropId ?? '');
  const [expenseDate, setExpenseDate] = useState(record?.expenseDate ?? todayInManila());
  const [description, setDescription] = useState(record?.description ?? '');
  const [amount, setAmount] = useState(record ? String(record.amount) : '');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);

  const usable = crops.filter((c) => c.isActive || c.id === record?.cropId);
  const groups = [...new Set(usable.map((c) => c.categoryName))];

  async function save(confirmDuplicate: boolean) {
    setFormError(null);
    const payload = { cropId, expenseDate, description, amount: amount.trim() === '' ? Number.NaN : Number(amount) };
    const check = editing
      ? updateExpenseSchema.safeParse(payload)
      : createExpenseSchema.safeParse(confirmDuplicate ? { ...payload, confirmDuplicate: true } : payload);
    if (!check.success) {
      const f = z.flattenError(check.error).fieldErrors as Record<string, string[] | undefined>;
      setErrors({ cropId: f.cropId?.[0], expenseDate: f.expenseDate?.[0], description: f.description?.[0], amount: f.amount?.[0] });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (editing) await apiFetch(`/expenses/${record.id}`, { method: 'PUT', json: check.data });
      else await apiFetch('/expenses', { method: 'POST', json: check.data });
      onSaved(editing ? 'Expense updated.' : 'Expense recorded.');
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'DUPLICATE_SUSPECTED') setDuplicate(true);
      else if (err instanceof ApiRequestError) {
        const d = err.details ?? {};
        setErrors({ cropId: d.cropId?.[0], expenseDate: d.expenseDate?.[0], description: d.description?.[0], amount: d.amount?.[0] });
        setFormError(err.message);
      } else setFormError('Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  const a11y = (id: Field) => ({ 'aria-invalid': !!errors[id], 'aria-describedby': errors[id] ? `${id}-error` : undefined });
  const err = (id: Field) => (errors[id] ? <p id={`${id}-error`} className="mt-1 text-sm text-red-700">{errors[id]}</p> : null);

  return (
    <Dialog title={editing ? 'Edit expense' : 'Record an expense'} onClose={onClose}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); setDuplicate(false); void save(false); }} noValidate className="space-y-4">
        {formError && <p role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm font-medium text-red-900">{formError}</p>}
        {duplicate && (
          <div role="alert" className="rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">This looks like a duplicate.</p>
            <p>An expense with the same crop, date, description and amount is already recorded. Save it anyway?</p>
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
          <label htmlFor="expenseDate" className="block text-sm font-semibold">Date *</label>
          <input id="expenseDate" type="date" value={expenseDate} max={todayInManila()} onChange={(e) => setExpenseDate(e.target.value)} className={inputClass} {...a11y('expenseDate')} />
          {err('expenseDate')}
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-semibold">What was it for? *</label>
          <input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Mushroom substrate" className={inputClass} autoComplete="off" {...a11y('description')} />
          {err('description')}
        </div>
        <div>
          <label htmlFor="amount" className="block text-sm font-semibold">Amount (PHP) *</label>
          <input id="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 198.25" className={inputClass} autoComplete="off" {...a11y('amount')} />
          {err('amount')}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={busy} className={primaryButton}>{busy ? 'Saving...' : 'Save'}</button>
        </div>
      </form>
    </Dialog>
  );
}