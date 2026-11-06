'use client';

import { useState } from 'react';
import { z } from 'zod';
import {
  QUARTERS, currentQuarterInManila, documentListSchema, quarterRange, reportDataSchema,
  type Quarter, type ReportData, type ReportRecord, type ReportTemplateRecord,
} from '@harvestgo/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { peso, QUARTER_LABELS, showDate } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import { Dialog, inputClass, primaryButton, secondaryButton } from './Dialog';

const previewAnswer = z.object({ data: reportDataSchema });
const sum = (rows: { amount: number }[]) => rows.reduce((n, r) => n + r.amount, 0);

function Summary({ d }: { d: ReportData }) {
  const activities = d.services.reduce((n, s) => n + s.activities, 0);
  const male = d.services.reduce((n, s) => n + s.male, 0);
  const female = d.services.reduce((n, s) => n + s.female, 0);
  const empty = activities + d.yield.length + d.cost.length + d.sales.length + d.income.length + d.issues.length === 0;
  const rows: [string, string][] = [
    ['Services rendered', `${activities} ${activities === 1 ? 'activity' : 'activities'}: ${male} male, ${female} female, ${male + female} total`],
    ['A. Yield', `${d.yield.length} ${d.yield.length === 1 ? 'crop' : 'crops'}`],
    ['B. Cost of production', peso.format(sum(d.cost))],
    ['C. Production sales (raw produce)', peso.format(sum(d.sales))],
    ['D. Production income (all sales)', peso.format(sum(d.income))],
    ['E. Problems and recommendations', `${d.issues.length} ${d.issues.length === 1 ? 'entry' : 'entries'}`],
  ];
  return (
    <div className="space-y-2">
      {empty && (
        <p role="note" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Nothing is recorded in this quarter yet. The report will be made, but its sections will be empty.
        </p>
      )}
      <dl className="divide-y divide-leaf-100 rounded-lg border-2 border-leaf-100 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-wrap justify-between gap-2 px-3 py-2"><dt className="font-medium">{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </div>
  );
}

export function GenerateReportDialog({ template, onDone, onClose }: {
  template: ReportTemplateRecord; onDone: (record: ReportRecord) => void; onClose: () => void;
}) {
  const now = currentQuarterInManila();
  const [year, setYear] = useState(now.year);
  const [quarter, setQuarter] = useState<Quarter>(now.quarter);
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = quarterRange(year, quarter);
  const photoElements = template.config.schemaVersion === 2
    ? template.config.pages.flatMap((page) => page.elements).filter((element) => element.type === 'photo_group' || element.type === 'photo')
    : [];
  const photosOn = template.config.schemaVersion === 1
    ? template.config.photos.enabled
    : photoElements.length > 0;
  const maxPhotos = template.config.schemaVersion === 1
    ? template.config.photos.maxPhotos
    : photoElements.reduce((max, element) => Math.max(max, element.type === 'photo_group' ? element.startIndex + element.maxPhotos : element.index + 1), 0);
  const preview = useApi(`/reports/preview?year=${year}&quarter=${quarter}`, previewAnswer);
  const photos = useApi(photosOn ? `/documents?kind=photo&from=${range.from}&to=${range.to}&pageSize=100&sort=date_asc` : null, documentListSchema);
  const years = [now.year, now.year - 1, now.year - 2, now.year - 3];

  function changePeriod(apply: () => void) {
    apply();
    setPhotoIds([]); // the photo list belongs to the quarter
    setError(null);
  }
  function togglePhoto(id: string) {
    setPhotoIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length < maxPhotos ? [...ids, id] : ids));
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const out = await apiFetch<{ record: ReportRecord }>('/reports/generate', { method: 'POST', json: { year, quarter, photoIds } });
      onDone(out.record);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <Dialog title="Make a quarterly report" onClose={onClose}>
      <div className="space-y-5">
        <div className="flex gap-3">
          <div>
            <label htmlFor="g-year" className="block text-sm font-semibold">Year</label>
            <select id="g-year" value={year} onChange={(e) => changePeriod(() => setYear(Number(e.target.value)))} disabled={busy} className={inputClass}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label htmlFor="g-quarter" className="block text-sm font-semibold">Quarter</label>
            <select id="g-quarter" value={quarter} onChange={(e) => changePeriod(() => setQuarter(Number(e.target.value) as Quarter))} disabled={busy} className={inputClass}>
              {QUARTERS.map((q) => <option key={q} value={q}>{QUARTER_LABELS[q]}</option>)}
            </select>
          </div>
        </div>

        <section aria-labelledby="g-review">
          <h3 id="g-review" className="mb-2 font-semibold">1. Review the numbers</h3>
          {preview.state.status === 'loading' && <p role="status" className="text-sm text-leaf-900/60">Adding up the quarter...</p>}
          {preview.state.status === 'error' && (
            <p role="alert" className="text-sm text-red-800">{preview.state.message} <button onClick={preview.reload} className="underline">Try again</button></p>
          )}
          {preview.state.status === 'ready' && <Summary d={preview.state.data.data} />}
          <p className="mt-1 text-xs text-leaf-900/60">{showDate(range.from)} to {showDate(range.to)}. These come straight from your records.</p>
        </section>

        {photosOn && (
          <fieldset>
            <legend className="mb-1 font-semibold">2. Choose photos (optional)</legend>
            <p className="mb-2 text-xs text-leaf-900/70">
              Photos dated in this quarter. The report uses them in the order you tick them, up to {maxPhotos}. Selected: {photoIds.length}.
            </p>
            {photos.state.status === 'loading' && <p role="status" className="text-sm text-leaf-900/60">Loading photos...</p>}
            {photos.state.status === 'error' && <p role="alert" className="text-sm text-red-800">{photos.state.message}</p>}
            {photos.state.status === 'ready' && photos.state.data.records.length === 0 && (
              <p className="rounded-lg border-2 border-dashed border-leaf-100 p-3 text-sm">No photos are dated in this quarter. You can add them on the Documents page.</p>
            )}
            {photos.state.status === 'ready' && photos.state.data.records.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border-2 border-leaf-100 p-2">
                {photos.state.data.records.map((p) => {
                  const position = photoIds.indexOf(p.id);
                  const checked = position >= 0;
                  const full = !checked && photoIds.length >= maxPhotos;
                  return (
                    <li key={p.id}>
                      <label className={`flex items-start gap-2 rounded px-2 py-1 text-sm ${full ? 'opacity-50' : 'hover:bg-leaf-50'}`}>
                        <input type="checkbox" checked={checked} disabled={full || busy} onChange={() => togglePhoto(p.id)} className="mt-1" />
                        <span className="flex-1">
                          <span className="font-medium break-all">{p.caption || p.originalName}</span>
                          <span className="block text-xs text-leaf-900/60">{showDate(p.documentDate)}{p.activityTitle ? `, ${p.activityTitle}` : ''}</span>
                        </span>
                        {checked && <span className="rounded-full bg-leaf-700 px-2 text-xs font-semibold text-white" aria-label={`Photo number ${position + 1}`}>{position + 1}</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>
        )}

        {error && <p role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm font-medium text-red-900">{error}</p>}
        {busy && <p role="status" className="rounded-lg bg-leaf-50 p-3 text-sm">Making your PDF. This can take up to a minute, please wait...</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>Cancel</button>
          <button type="button" onClick={() => void generate()} disabled={busy || preview.state.status === 'error'} className={primaryButton}>
            {busy ? 'Making the PDF...' : `${photosOn ? '3. ' : '2. '}Make the report`}
          </button>
        </div>
      </div>
    </Dialog>
  );
}