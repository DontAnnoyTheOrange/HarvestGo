'use client';

import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import {
  UNITS, UNIT_LABELS, createHarvestSchema, todayInManila, updateHarvestSchema,
  type Crop, type HarvestRecord, type Unit,
} from '@harvestgo/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dialog, inputClass, primaryButton, secondaryButton } from './Dialog';

type Field = 'cropId' | 'harvestDate' | 'quantity' | 'unit' | 'notes';
type Errors = Partial<Record<Field, string>>;

export function HarvestFormDialog({
  record, crops, onSaved, onClose,
}: {
  record?: HarvestRecord;
  crops: Crop[];
  onSaved: (message: string) => void;
  onClose: () => void;
}) {
  const editing = !!record;
  const [cropId, setCropId] = useState(record?.cropId ?? '');
  const [harvestDate, setHarvestDate] = useState(record?.harvestDate ?? todayInManila());
  const [quantity, setQuantity] = useState(record ? String(record.quantity) : '');
  const [unit, setUnit] = useState<Unit>(record?.unit ?? 'kg');
  const [notes, setNotes] = useState(record?.notes ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);

  // Group the crop list by category for the dropdown. Keep the record's own crop even if switched off.
  const usable = crops.filter((c) => c.isActive || c.id === record?.cropId);
  const groups = [...new Set(usable.map((c) => c.categoryName))];

  async function save(confirmDuplicate: boolean) {
    setFormError(null);
    const payload = {
      cropId,
      harvestDate,
      quantity: quantity.trim() === '' ? Number.NaN : Number(quantity),
      unit,
      notes,
    };
    // Quick check on the screen; the server checks again.
    const check = editing
      ? updateHarvestSchema.safeParse(payload)
      : createHarvestSchema.safeParse(confirmDuplicate ? { ...payload, confirmDuplicate: true } : payload);
    if (!check.success) {
      const f = z.flattenError(check.error).fieldErrors as Record<string, string[] | undefined>;
      setErrors({ cropId: f.cropId?.[0], harvestDate: f.harvestDate?.[0], quantity: f.quantity?.[0], unit: f.unit?.[0], notes: f.notes?.[0] });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (editing) await apiFetch(`/harvests/${record.id}`, { method: 'PATCH', json: check.data });
      else await apiFetch('/harvests', { method: 'POST', json: check.data });
      onSaved(editing ? 'Harvest record updated.' : 'Harvest recorded.');
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'DUPLICATE_SUSPECTED') {
        setDuplicate(true);
      } else if (err instanceof ApiRequestError) {
        const d = err.details ?? {};
        setErrors({ cropId: d.cropId?.[0], harvestDate: d.harvestDate?.[0], quantity: d.quantity?.[0], unit: d.unit?.[0], notes: d.notes?.[0] });
        setFormError(err.message);
      } else setFormError('Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setDuplicate(false);
    void save(false);
  }

  const a11y = (id: Field) => ({ 'aria-invalid': !!errors[id], 'aria-describedby': errors[id] ? `${id}-error` : undefined });
  const err = (id: Field) => (errors[id] ? <p id={`${id}-error`} className="mt-1 text-sm text-red-700">{errors[id]}</p> : null);

  return (
    <Dialog title={editing ? 'Edit harvest' : 'Record a harvest'} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <p role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm font-medium text-red-900">{formError}</p>}

        {duplicate && (
          <div role="alert" className="rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">This looks like a duplicate.</p>
            <p>A harvest with the same crop, date and amount is already recorded. Save it anyway?</p>
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
                {usable.filter((c) => c.categoryName === g).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.isActive ? '' : ' (switched off)'}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {usable.length === 0 && <p className="mt-1 text-sm text-amber-800">There are no crops yet. Ask the General Manager to add them.</p>}
          {err('cropId')}
        </div>

        <div>
          <label htmlFor="harvestDate" className="block text-sm font-semibold">Harvest date *</label>
          <input id="harvestDate" type="date" value={harvestDate} max={todayInManila()} onChange={(e) => setHarvestDate(e.target.value)} className={inputClass} {...a11y('harvestDate')} />
          {err('harvestDate')}
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="quantity" className="block text-sm font-semibold">Amount *</label>
            <input id="quantity" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 30.986" className={inputClass} autoComplete="off" {...a11y('quantity')} />
            {err('quantity')}
          </div>
          <div className="w-28">
            <label htmlFor="unit" className="block text-sm font-semibold">Unit *</label>
            <select id="unit" value={unit} onChange={(e) => setUnit(e.target.value as Unit)} className={inputClass} {...a11y('unit')}>
              {UNITS.map((u) => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-semibold">Notes (optional)</label>
          <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} {...a11y('notes')} />
          {err('notes')}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={busy} className={primaryButton}>{busy ? 'Saving...' : 'Save'}</button>
        </div>
      </form>
    </Dialog>
  );
}