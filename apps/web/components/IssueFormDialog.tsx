'use client';

import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import {
  activityListSchema, createIssueSchema, todayInManila, updateIssueSchema,
  type Crop, type IssueRecord,
} from '@harvestgo/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { showDate } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import { Dialog, inputClass, primaryButton, secondaryButton } from './Dialog';

type Field = 'issueDate' | 'problem' | 'actionTaken' | 'recommendation' | 'cropId' | 'activityId';

export function IssueFormDialog({ record, crops, onSaved, onClose }: {
  record?: IssueRecord; crops: Crop[]; onSaved: (message: string) => void; onClose: () => void;
}) {
  const editing = !!record;
  const [issueDate, setIssueDate] = useState(record?.issueDate ?? todayInManila());
  const [problem, setProblem] = useState(record?.problem ?? '');
  const [actionTaken, setActionTaken] = useState(record?.actionTaken ?? '');
  const [recommendation, setRecommendation] = useState(record?.recommendation ?? '');
  const [cropId, setCropId] = useState(record?.cropId ?? '');
  const [activityId, setActivityId] = useState(record?.activityId ?? '');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);

  // The activity list lets the person link an issue to an activity (optional).
  const activities = useApi('/activities?pageSize=100&status=all&sort=date_desc', activityListSchema);

  const usable = crops.filter((c) => c.isActive || c.id === record?.cropId);
  const groups = [...new Set(usable.map((c) => c.categoryName))];

  async function save(confirmDuplicate: boolean) {
    setFormError(null);
    const payload = { issueDate, problem, actionTaken, recommendation, cropId: cropId || null, activityId: activityId || null };
    const check = editing
      ? updateIssueSchema.safeParse(payload)
      : createIssueSchema.safeParse(confirmDuplicate ? { ...payload, confirmDuplicate: true } : payload);
    if (!check.success) {
      const f = z.flattenError(check.error).fieldErrors as Record<string, string[] | undefined>;
      setErrors(Object.fromEntries((Object.keys(f) as Field[]).map((k) => [k, f[k]?.[0]])));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (editing) await apiFetch(`/issues/${record.id}`, { method: 'PUT', json: check.data });
      else await apiFetch('/issues', { method: 'POST', json: check.data });
      onSaved(editing ? 'Issue updated.' : 'Issue recorded.');
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
    <Dialog title={editing ? 'Edit issue' : 'Record an issue'} onClose={onClose}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); setDuplicate(false); void save(false); }} noValidate className="space-y-4">
        {formError && <p role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm font-medium text-red-900">{formError}</p>}
        {duplicate && (
          <div role="alert" className="rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">This looks like a duplicate.</p>
            <p>An issue with the same date and description is already recorded. Save it anyway?</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => { setDuplicate(false); void save(true); }} className={primaryButton}>Save anyway</button>
              <button type="button" onClick={() => setDuplicate(false)} className={secondaryButton}>Go back and check</button>
            </div>
          </div>
        )}

        <div>
          <label htmlFor="issueDate" className="block text-sm font-semibold">Date *</label>
          <input id="issueDate" type="date" value={issueDate} max={todayInManila()} onChange={(e) => setIssueDate(e.target.value)} className={inputClass} {...a11y('issueDate')} />
          {err('issueDate')}
        </div>
        <div>
          <label htmlFor="problem" className="block text-sm font-semibold">Problem or difficulty encountered *</label>
          <textarea id="problem" rows={3} value={problem} onChange={(e) => setProblem(e.target.value)} className={inputClass} {...a11y('problem')} />
          {err('problem')}
        </div>
        <div>
          <label htmlFor="actionTaken" className="block text-sm font-semibold">Action taken (optional)</label>
          <textarea id="actionTaken" rows={2} value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} className={inputClass} {...a11y('actionTaken')} />
          {err('actionTaken')}
        </div>
        <div>
          <label htmlFor="recommendation" className="block text-sm font-semibold">Recommendation (optional)</label>
          <textarea id="recommendation" rows={2} value={recommendation} onChange={(e) => setRecommendation(e.target.value)} className={inputClass} {...a11y('recommendation')} />
          {err('recommendation')}
        </div>

        <div>
          <label htmlFor="cropId" className="block text-sm font-semibold">About a crop (optional)</label>
          <select id="cropId" value={cropId} onChange={(e) => setCropId(e.target.value)} className={inputClass} {...a11y('cropId')}>
            <option value="">No specific crop</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {usable.filter((c) => c.categoryName === g).map((c) => <option key={c.id} value={c.id}>{c.name}{c.isActive ? '' : ' (switched off)'}</option>)}
              </optgroup>
            ))}
          </select>
          {err('cropId')}
        </div>
        <div>
          <label htmlFor="activityId" className="block text-sm font-semibold">Linked activity (optional)</label>
          <select id="activityId" value={activityId} onChange={(e) => setActivityId(e.target.value)} className={inputClass} {...a11y('activityId')}>
            <option value="">No linked activity</option>
            {activities.state.status === 'ready' && activities.state.data.records.map((a) => (
              <option key={a.id} value={a.id}>{a.title} ({showDate(a.activityDate)})</option>
            ))}
            {/* keep the current link visible even if the list is still loading or the activity is older than the list */}
            {record?.activityId && !(activities.state.status === 'ready' && activities.state.data.records.some((a) => a.id === record.activityId)) && (
              <option value={record.activityId}>{record.activityTitle ?? 'Linked activity'}</option>
            )}
          </select>
          {activities.state.status === 'loading' && <p className="mt-1 text-xs text-leaf-900/60">Loading activities...</p>}
          {err('activityId')}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={busy} className={primaryButton}>{busy ? 'Saving...' : 'Save'}</button>
        </div>
      </form>
    </Dialog>
  );
}