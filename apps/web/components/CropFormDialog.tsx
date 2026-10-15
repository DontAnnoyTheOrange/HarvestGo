'use client';

import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { createCropSchema, updateCropSchema, type Crop, type CropCategory } from '@harvestgo/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dialog, inputClass, primaryButton, secondaryButton } from './Dialog';

export function CropFormDialog({
  crop, categories, onSaved, onClose,
}: {
  crop?: Crop;
  categories: CropCategory[];
  onSaved: (message: string) => void;
  onClose: () => void;
}) {
  const editing = !!crop;
  const [categoryId, setCategoryId] = useState<number>(crop?.categoryId ?? categories[0]?.id ?? 0);
  const [name, setName] = useState(crop?.name ?? '');
  const [isActive, setIsActive] = useState(crop?.isActive ?? true);
  const [errors, setErrors] = useState<{ name?: string; categoryId?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const check = editing
      ? updateCropSchema.safeParse({ name, isActive })
      : createCropSchema.safeParse({ categoryId, name });
    if (!check.success) {
      const f = z.flattenError(check.error).fieldErrors as Record<string, string[] | undefined>;
      setErrors({ name: f.name?.[0], categoryId: f.categoryId?.[0] });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (editing) await apiFetch(`/crops/${crop.id}`, { method: 'PATCH', json: check.data });
      else await apiFetch('/crops', { method: 'POST', json: check.data });
      onSaved(editing ? `Saved changes to ${name.trim()}.` : `${name.trim()} added to the crop list.`);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setFormError(err.code === 'ALREADY_EXISTS' ? 'That crop is already in this category.' : err.message);
      } else setFormError('Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <Dialog title={editing ? 'Edit crop' : 'Add a crop'} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && <p role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm font-medium text-red-900">{formError}</p>}

        <div>
          <label htmlFor="category" className="block text-sm font-semibold">Category *</label>
          <select id="category" value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))} disabled={editing} className={`${inputClass} disabled:bg-leaf-50`}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {editing && <p className="mt-1 text-xs text-leaf-900/60">The category cannot be changed, so past reports stay correct.</p>}
          {errors.categoryId && <p className="mt-1 text-sm text-red-700">{errors.categoryId}</p>}
        </div>

        <div>
          <label htmlFor="cropName" className="block text-sm font-semibold">Crop name *</label>
          <input id="cropName" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoComplete="off" aria-invalid={!!errors.name} aria-describedby={errors.name ? 'cropName-error' : undefined} />
          {errors.name && <p id="cropName-error" className="mt-1 text-sm text-red-700">{errors.name}</p>}
        </div>

        {editing && (
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Crop is in use
            </label>
            {!isActive && <p role="note" className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">Switched-off crops disappear from the harvest form. Existing records keep them.</p>}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={busy} className={primaryButton}>{busy ? 'Saving...' : 'Save'}</button>
        </div>
      </form>
    </Dialog>
  );
}