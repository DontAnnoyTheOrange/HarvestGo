'use client';

import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { activityListSchema, todayInManila, updateDocumentSchema, type DocumentRecord } from '@harvestgo/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { showDate } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import { Dialog, inputClass, primaryButton, secondaryButton } from './Dialog';

type Field = 'caption' | 'documentDate' | 'activityId';

/** Changes the description of a file (caption, date, linked activity). The file itself never changes. */
export function DocumentEditDialog({ record, onSaved, onClose }: { record: DocumentRecord; onSaved: (message: string) => void; onClose: () => void }) {
  const [caption, setCaption] = useState(record.caption ?? '');
  const [documentDate, setDocumentDate] = useState(record.documentDate);
  const [activityId, setActivityId] = useState(record.activityId ?? '');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const activities = useApi('/activities?pageSize=100&status=all&sort=date_desc', activityListSchema);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const check = updateDocumentSchema.safeParse({ caption, documentDate, activityId: activityId || null });
    if (!check.success) {
      const f = z.flattenError(check.error).fieldErrors as Record<string, string[] | undefined>;
      setErrors(Object.fromEntries((Object.keys(f) as Field[]).map((k) => [k, f[k]?.[0]])));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await apiFetch(`/documents/${record.id}`, { method: 'PUT', json: check.data });
      onSaved('File details updated.');
    } catch (err) {
      if (err instanceof ApiRequestError) {
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
    <Dialog title="Edit file details" onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <p className="text-sm text-leaf-900/70">File: <strong>{record.originalName}</strong> (the file itself cannot be changed; upload a new one instead).</p>
        {formError && <p role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm font-medium text-red-900">{formError}</p>}
        <div>
          <label htmlFor="caption" className="block text-sm font-semibold">Caption (optional)</label>
          <input id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} className={inputClass} autoComplete="off" {...a11y('caption')} />
          {err('caption')}
        </div>
        <div>
          <label htmlFor="documentDate" className="block text-sm font-semibold">Date *</label>
          <input id="documentDate" type="date" value={documentDate} max={todayInManila()} onChange={(e) => setDocumentDate(e.target.value)} className={inputClass} {...a11y('documentDate')} />
          {err('documentDate')}
        </div>
        <div>
          <label htmlFor="activityId" className="block text-sm font-semibold">Linked activity (optional)</label>
          <select id="activityId" value={activityId} onChange={(e) => setActivityId(e.target.value)} className={inputClass} {...a11y('activityId')}>
            <option value="">No linked activity</option>
            {activities.state.status === 'ready' && activities.state.data.records.map((a) => (
              <option key={a.id} value={a.id}>{a.title} ({showDate(a.activityDate)})</option>
            ))}
            {record.activityId && !(activities.state.status === 'ready' && activities.state.data.records.some((a) => a.id === record.activityId)) && (
              <option value={record.activityId}>{record.activityTitle ?? 'Linked activity'}</option>
            )}
          </select>
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