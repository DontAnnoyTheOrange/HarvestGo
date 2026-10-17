'use client';

import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import {
  SERVICE_TYPES, SERVICE_TYPE_LABELS, createActivitySchema, todayInManila, updateActivitySchema,
  type ActivityRecord, type ParticipantType, type ServiceType,
} from '@harvestgo/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dialog, inputClass, primaryButton, secondaryButton } from './Dialog';

type Field = 'serviceType' | 'title' | 'activityDate' | 'description' | 'scope' | 'attendance';
type Counts = Record<number, { male: string; female: string }>;

/** Blank means 0. Anything else must be a whole number (checked by the rules). */
const toNumber = (text: string) => (text.trim() === '' ? 0 : Number(text.trim()));

export function ActivityFormDialog({ record, types, onSaved, onClose }: {
  record?: ActivityRecord; types: ParticipantType[]; onSaved: (message: string) => void; onClose: () => void;
}) {
  const editing = !!record;
  const [serviceType, setServiceType] = useState<ServiceType>(record?.serviceType ?? 'training');
  const [title, setTitle] = useState(record?.title ?? '');
  const [activityDate, setActivityDate] = useState(record?.activityDate ?? todayInManila());
  const [description, setDescription] = useState(record?.description ?? '');
  const [scope, setScope] = useState(record?.scope ?? '');
  const [counts, setCounts] = useState<Counts>(() => {
    const start: Counts = {};
    for (const a of record?.attendance ?? []) start[a.participantTypeId] = { male: String(a.male), female: String(a.female) };
    return start;
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);

  const existing = new Set((record?.attendance ?? []).map((a) => a.participantTypeId));
  const cell = (id: number, which: 'male' | 'female') => counts[id]?.[which] ?? '';
  const setCell = (id: number, which: 'male' | 'female', value: string) =>
    setCounts((c) => ({ ...c, [id]: { male: c[id]?.male ?? '', female: c[id]?.female ?? '', [which]: value } }));

  const totalOf = (which: 'male' | 'female') => types.reduce((n, t) => n + (Number.isFinite(toNumber(cell(t.id, which))) ? toNumber(cell(t.id, which)) : 0), 0);
  const maleTotal = totalOf('male');
  const femaleTotal = totalOf('female');

  async function save(confirmDuplicate: boolean) {
    setFormError(null);
    // Send a row when something was typed, or when the row already existed (so it can be corrected to 0).
    const attendance = types
      .filter((t) => cell(t.id, 'male').trim() !== '' || cell(t.id, 'female').trim() !== '' || existing.has(t.id))
      .map((t) => ({ participantTypeId: t.id, male: toNumber(cell(t.id, 'male')), female: toNumber(cell(t.id, 'female')) }));
    const payload = { serviceType, title, activityDate, description, scope, attendance };

    // Quick check on the screen; the server checks again.
    const check = editing
      ? updateActivitySchema.safeParse(payload)
      : createActivitySchema.safeParse(confirmDuplicate ? { ...payload, confirmDuplicate: true } : payload);
    if (!check.success) {
      const f = z.flattenError(check.error).fieldErrors as Record<string, string[] | undefined>;
      setErrors(Object.fromEntries((Object.keys(f) as Field[]).map((k) => [k, f[k]?.[0]])));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (editing) await apiFetch(`/activities/${record.id}`, { method: 'PUT', json: check.data });
      else await apiFetch('/activities', { method: 'POST', json: check.data });
      onSaved(editing ? 'Activity updated.' : 'Activity recorded.');
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
    <Dialog title={editing ? 'Edit activity' : 'Record an activity'} onClose={onClose}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); setDuplicate(false); void save(false); }} noValidate className="space-y-4">
        {formError && <p role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm font-medium text-red-900">{formError}</p>}
        {duplicate && (
          <div role="alert" className="rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">This looks like a duplicate.</p>
            <p>An activity with the same title, type and date is already recorded. Save it anyway?</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => { setDuplicate(false); void save(true); }} className={primaryButton}>Save anyway</button>
              <button type="button" onClick={() => setDuplicate(false)} className={secondaryButton}>Go back and check</button>
            </div>
          </div>
        )}

        <div>
          <label htmlFor="serviceType" className="block text-sm font-semibold">Kind of service *</label>
          <select id="serviceType" value={serviceType} onChange={(e) => setServiceType(e.target.value as ServiceType)} className={inputClass} {...a11y('serviceType')}>
            {SERVICE_TYPES.map((t) => <option key={t} value={t}>{SERVICE_TYPE_LABELS[t]}</option>)}
          </select>
          {err('serviceType')}
        </div>
        <div>
          <label htmlFor="title" className="block text-sm font-semibold">Title *</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mushroom Cultivation Seminar" className={inputClass} autoComplete="off" {...a11y('title')} />
          {err('title')}
        </div>
        <div>
          <label htmlFor="activityDate" className="block text-sm font-semibold">Date *</label>
          <input id="activityDate" type="date" value={activityDate} max={todayInManila()} onChange={(e) => setActivityDate(e.target.value)} className={inputClass} {...a11y('activityDate')} />
          {err('activityDate')}
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-semibold">Description (optional)</label>
          <textarea id="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} {...a11y('description')} />
          {err('description')}
        </div>
        <div>
          <label htmlFor="scope" className="block text-sm font-semibold">Scope (optional)</label>
          <input id="scope" value={scope} onChange={(e) => setScope(e.target.value)} placeholder="e.g. Open to farmers of Amadeo" className={inputClass} autoComplete="off" {...a11y('scope')} />
          {err('scope')}
        </div>

        <fieldset>
          <legend className="text-sm font-semibold">Head-count (how many attended)</legend>
          <p className="mt-1 text-xs text-leaf-900/70">
            Type only <strong>numbers</strong>. Do not enter names. Leave a box empty for none. Fill in only the types that attended.
          </p>
          <div className="mt-2 overflow-x-auto rounded-lg border-2 border-leaf-100">
            <table className="w-full min-w-[22rem] text-left text-sm">
              <caption className="sr-only">Head-count by participant type</caption>
              <thead className="bg-leaf-50">
                <tr>
                  <th scope="col" className="p-2">Participant type</th>
                  <th scope="col" className="w-20 p-2">Male</th>
                  <th scope="col" className="w-20 p-2">Female</th>
                  <th scope="col" className="w-16 p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => {
                  const rowTotal = (Number.isFinite(toNumber(cell(t.id, 'male'))) ? toNumber(cell(t.id, 'male')) : 0) + (Number.isFinite(toNumber(cell(t.id, 'female'))) ? toNumber(cell(t.id, 'female')) : 0);
                  return (
                    <tr key={t.id} className="border-t border-leaf-100">
                      <th scope="row" className="p-2 font-medium">{t.name}</th>
                      <td className="p-1"><input inputMode="numeric" aria-label={`${t.name}, male`} value={cell(t.id, 'male')} onChange={(e) => setCell(t.id, 'male', e.target.value)} className={`${inputClass} !mt-0 !px-2 !py-1`} autoComplete="off" /></td>
                      <td className="p-1"><input inputMode="numeric" aria-label={`${t.name}, female`} value={cell(t.id, 'female')} onChange={(e) => setCell(t.id, 'female', e.target.value)} className={`${inputClass} !mt-0 !px-2 !py-1`} autoComplete="off" /></td>
                      <td className="p-2 text-right">{rowTotal}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-leaf-100 bg-leaf-50 font-semibold">
                <tr>
                  <th scope="row" className="p-2">All participants</th>
                  <td className="p-2">{maleTotal}</td>
                  <td className="p-2">{femaleTotal}</td>
                  <td className="p-2 text-right">{maleTotal + femaleTotal}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {err('attendance')}
        </fieldset>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={busy} className={primaryButton}>{busy ? 'Saving...' : 'Save'}</button>
        </div>
      </form>
    </Dialog>
  );
}