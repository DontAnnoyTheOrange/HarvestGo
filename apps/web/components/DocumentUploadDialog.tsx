'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { z } from 'zod';
import {
  DOCUMENT_KINDS, DOCUMENT_KIND_LABELS, MAX_STORED_BYTES, MAX_UPLOAD_BYTES, activityListSchema, todayInManila, uploadFieldsSchema,
  type DocumentKind,
} from '@harvestgo/shared';
import { ApiRequestError } from '@/lib/api';
import { apiUpload } from '@/lib/apiUpload';
import { showDate } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import { Dialog, inputClass, primaryButton, secondaryButton } from './Dialog';

type Field = 'file' | 'kind' | 'caption' | 'documentDate' | 'activityId';
const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

/** A quick look at the file's name/type to help the person early. The server checks the real contents. */
function looksLike(file: File): 'image' | 'pdf' | 'other' {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (['image/jpeg', 'image/png'].includes(file.type) || /\.(jpe?g|png)$/.test(name)) return 'image';
  return 'other';
}

export function DocumentUploadDialog({ onSaved, onClose }: { onSaved: (message: string) => void; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<DocumentKind>('photo');
  const [caption, setCaption] = useState('');
  const [documentDate, setDocumentDate] = useState(todayInManila());
  const [activityId, setActivityId] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const activities = useApi('/activities?pageSize=100&status=all&sort=date_desc', activityListSchema);

  const type = file ? looksLike(file) : null;

  // A small preview of the chosen photo (made on this computer; nothing is sent yet).
  const previewUrl = useMemo(() => (file && type === 'image' ? URL.createObjectURL(file) : null), [file, type]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function chooseFile(next: File | null) {
    setFile(next);
    setErrors((e) => ({ ...e, file: undefined }));
    if (next && looksLike(next) === 'pdf') setKind('supporting_document'); // a PDF can only be a supporting document
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const next: Partial<Record<Field, string>> = {};

    // Quick checks on the screen. The server checks again, and also looks inside the file.
    if (!file) next.file = 'Choose a file to upload.';
    else if (type === 'other') next.file = 'Use a JPEG or PNG photo, or a PDF.';
    else if (file.size > MAX_UPLOAD_BYTES) next.file = `That file is too large. The limit is ${mb(MAX_UPLOAD_BYTES)}.`;
    else if (type === 'pdf' && file.size > MAX_STORED_BYTES) next.file = `A PDF can be at most ${mb(MAX_STORED_BYTES)}.`;

    const fields = uploadFieldsSchema.safeParse({ kind, caption, documentDate, activityId });
    if (!fields.success) {
      const f = z.flattenError(fields.error).fieldErrors as Record<string, string[] | undefined>;
      for (const k of ['kind', 'caption', 'documentDate', 'activityId'] as const) if (f[k]?.[0]) next[k] = f[k]?.[0];
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || !file || !fields.success) return;

    const form = new FormData();
    form.append('kind', fields.data.kind);
    form.append('caption', fields.data.caption ?? '');
    form.append('documentDate', fields.data.documentDate);
    form.append('activityId', fields.data.activityId ?? '');
    form.append('file', file); // the file goes last
    setBusy(true);
    try {
      await apiUpload('/documents', form);
      onSaved(type === 'image' ? 'Photo uploaded (shrunk to save space).' : 'File uploaded.');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const d = err.details ?? {};
        setErrors({ kind: d.kind?.[0], caption: d.caption?.[0], documentDate: d.documentDate?.[0], activityId: d.activityId?.[0] });
        setFormError(err.message);
      } else setFormError('Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  const a11y = (id: Field) => ({ 'aria-invalid': !!errors[id], 'aria-describedby': errors[id] ? `${id}-error` : undefined });
  const err = (id: Field) => (errors[id] ? <p id={`${id}-error`} className="mt-1 text-sm text-red-700">{errors[id]}</p> : null);

  return (
    <Dialog title="Upload a photo or document" onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && <p role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm font-medium text-red-900">{formError}</p>}

        <div>
          <label htmlFor="file" className="block text-sm font-semibold">File *</label>
          <input
            id="file" type="file" accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
            onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-leaf-100 file:px-3 file:py-1 file:font-semibold`} {...a11y('file')}
          />
          <p className="mt-1 text-xs text-leaf-900/70">
            JPEG or PNG photos (up to {mb(MAX_UPLOAD_BYTES)}, shrunk automatically) or PDFs (up to {mb(MAX_STORED_BYTES)}).
          </p>
          {err('file')}
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Preview of the chosen photo" className="mt-2 max-h-40 rounded-lg border-2 border-leaf-100" />
          )}
        </div>

        <div>
          <label htmlFor="kind" className="block text-sm font-semibold">What is it? *</label>
          <select id="kind" value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)} disabled={type === 'pdf'} className={`${inputClass} disabled:bg-leaf-50`} {...a11y('kind')}>
            {DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{DOCUMENT_KIND_LABELS[k]}</option>)}
          </select>
          {type === 'pdf' && <p className="mt-1 text-xs text-leaf-900/70">A PDF is always a supporting document.</p>}
          {err('kind')}
        </div>

        <div>
          <label htmlFor="caption" className="block text-sm font-semibold">Caption (optional)</label>
          <input id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. Mushroom Cultivation Seminar, group photo" className={inputClass} autoComplete="off" {...a11y('caption')} />
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
          </select>
          {err('activityId')}
        </div>

        <p role="note" className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          Photos can show identifiable people. Make sure the people shown agree to it before you upload.
        </p>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={busy} className={primaryButton}>{busy ? 'Uploading...' : 'Upload'}</button>
        </div>
      </form>
    </Dialog>
  );
}