'use client';

import { useEffect, useState } from 'react';
import {
  DOCUMENT_KINDS, DOCUMENT_KIND_LABELS, DOCUMENT_SORTS, activityListSchema, documentListSchema,
  type DocumentKind, type DocumentList, type DocumentRecord, type DocumentSort,
} from '@harvestgo/shared';
import { apiFetch } from '@/lib/api';
import { showDate } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import { useCurrentUser } from './AppShell';
import { ConfirmDialog } from './ConfirmDialog';
import { inputClass, primaryButton, secondaryButton } from './Dialog';
import { DocumentEditDialog } from './DocumentEditDialog';
import { DocumentUploadDialog } from './DocumentUploadDialog';
import { DocumentViewDialog } from './DocumentViewDialog';
import { Pagination } from './Pagination';

const PAGE_SIZE = 20;
const SORT_LABELS: Record<DocumentSort, string> = { date_desc: 'Newest first', date_asc: 'Oldest first' };
const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: DocumentList };
type Open =
  | { kind: 'none' } | { kind: 'upload' }
  | { kind: 'view'; record: DocumentRecord } | { kind: 'edit'; record: DocumentRecord } | { kind: 'delete'; record: DocumentRecord };

export function DocumentManager() {
  const me = useCurrentUser();
  const isManager = me.role === 'general_manager';
  const activities = useApi('/activities?pageSize=100&status=all&sort=date_desc', activityListSchema);

  const [kind, setKind] = useState<DocumentKind | ''>('');
  const [activityId, setActivityId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<DocumentSort>('date_desc');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [open, setOpen] = useState<Open>({ kind: 'none' });
  const [notice, setNotice] = useState<string | null>(null);
  const filtered = kind !== '' || activityId !== '' || from !== '' || to !== '';

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sort });
    if (kind) params.set('kind', kind);
    if (activityId) params.set('activityId', activityId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    apiFetch<unknown>(`/documents?${params}`)
      .then((raw) => {
        if (cancelled) return;
        const data = documentListSchema.parse(raw);
        const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
        if (data.records.length === 0 && page > pages) setPage(pages);
        else setLoad({ status: 'ready', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoad({ status: 'error', message: err instanceof Error ? err.message : 'Could not load files.' });
      });
    return () => { cancelled = true; };
  }, [page, kind, activityId, from, to, sort, reloadKey]);

  const close = () => setOpen({ kind: 'none' });
  const saved = (message: string) => { close(); setNotice(message); setReloadKey((k) => k + 1); };
  const changeFilter = (apply: () => void) => { apply(); setPage(1); setLoad({ status: 'loading' }); };
  const clearFilters = () => changeFilter(() => { setKind(''); setActivityId(''); setFrom(''); setTo(''); });
  const totalPages = load.status === 'ready' ? Math.max(1, Math.ceil(load.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-leaf-700">Documents and photos</h1>
          <p className="text-leaf-900/70">Supporting files and photos for the report (ATI report Section G). Files are private.</p>
        </div>
        <button onClick={() => setOpen({ kind: 'upload' })} className={primaryButton}>Upload file</button>
      </div>

      {notice && <p role="status" className="rounded-lg border-2 border-leaf-600 bg-leaf-50 p-3 font-medium">{notice}</p>}

      <fieldset className="grid gap-3 rounded-xl border-2 border-leaf-100 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <legend className="px-2 text-sm font-semibold">Filter and sort</legend>
        <div>
          <label htmlFor="f-kind" className="block text-sm font-medium">Kind</label>
          <select id="f-kind" value={kind} onChange={(e) => changeFilter(() => setKind(e.target.value as DocumentKind | ''))} className={inputClass}>
            <option value="">All files</option>
            {DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{DOCUMENT_KIND_LABELS[k]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-activity" className="block text-sm font-medium">Activity</label>
          <select id="f-activity" value={activityId} onChange={(e) => changeFilter(() => setActivityId(e.target.value))} className={inputClass}>
            <option value="">All activities</option>
            {activities.state.status === 'ready' && activities.state.data.records.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-from" className="block text-sm font-medium">From</label>
          <input id="f-from" type="date" value={from} max={to || undefined} onChange={(e) => changeFilter(() => setFrom(e.target.value))} className={inputClass} />
        </div>
        <div>
          <label htmlFor="f-to" className="block text-sm font-medium">To</label>
          <input id="f-to" type="date" value={to} min={from || undefined} onChange={(e) => changeFilter(() => setTo(e.target.value))} className={inputClass} />
        </div>
        <div>
          <label htmlFor="f-sort" className="block text-sm font-medium">Sort</label>
          <select id="f-sort" value={sort} onChange={(e) => changeFilter(() => setSort(e.target.value as DocumentSort))} className={inputClass}>
            {DOCUMENT_SORTS.map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
          </select>
        </div>
        {filtered && <div className="sm:col-span-2 lg:col-span-5"><button onClick={clearFilters} className={secondaryButton}>Clear filters</button></div>}
      </fieldset>

      {load.status === 'loading' && <p role="status" className="text-leaf-900/70">Loading files...</p>}
      {load.status === 'error' && (
        <div role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-4 text-red-900">
          {load.message}
          <button onClick={() => { setLoad({ status: 'loading' }); setReloadKey((k) => k + 1); }} className={`${secondaryButton} ml-4`}>Try again</button>
        </div>
      )}

      {load.status === 'ready' && load.data.total === 0 && (
        <div className="rounded-xl border-2 border-dashed border-leaf-100 bg-white p-8 text-center">
          {filtered ? (<><p>No files match these filters.</p><button onClick={clearFilters} className={`${secondaryButton} mt-3`}>Clear filters</button></>)
            : (<><p>No files uploaded yet.</p><button onClick={() => setOpen({ kind: 'upload' })} className={`${primaryButton} mt-3`}>Upload the first file</button></>)}
        </div>
      )}

      {load.status === 'ready' && load.data.total > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border-2 border-leaf-100 bg-white">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <caption className="sr-only">Documents and photos</caption>
              <thead className="bg-leaf-50">
                <tr>
                  <th scope="col" className="p-3">Date</th>
                  <th scope="col" className="p-3">File</th>
                  <th scope="col" className="p-3">Caption</th>
                  <th scope="col" className="p-3">Linked activity</th>
                  <th scope="col" className="p-3">Uploaded by</th>
                  <th scope="col" className="p-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {load.data.records.map((r) => {
                  const canEdit = isManager || r.uploadedBy === me.id; // the server enforces this too
                  const label = r.caption || r.originalName;
                  return (
                    <tr key={r.id} className="border-t border-leaf-100 align-top">
                      <td className="whitespace-nowrap p-3">{showDate(r.documentDate)}</td>
                      <td className="p-3"><span className="font-medium break-all">{r.originalName}</span><span className="block text-xs text-leaf-900/60">{DOCUMENT_KIND_LABELS[r.kind]}, {size(r.sizeBytes)}</span></td>
                      <td className="max-w-xs p-3">{r.caption ?? ''}</td>
                      <td className="p-3">{r.activityTitle ?? ''}</td>
                      <td className="p-3">{r.uploadedByName}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button onClick={() => setOpen({ kind: 'view', record: r })} className={secondaryButton} aria-label={`View ${label}`}>View</button>
                          {canEdit && <button onClick={() => setOpen({ kind: 'edit', record: r })} className={secondaryButton} aria-label={`Edit details of ${label}`}>Edit</button>}
                          {isManager && <button onClick={() => setOpen({ kind: 'delete', record: r })} className={`${secondaryButton} !border-red-700 !text-red-700 hover:!bg-red-50`} aria-label={`Delete ${label}`}>Delete</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} total={load.data.total} noun="file" onPage={setPage} />
        </>
      )}

      {open.kind === 'upload' && <DocumentUploadDialog onSaved={saved} onClose={close} />}
      {open.kind === 'view' && <DocumentViewDialog record={open.record} onClose={close} />}
      {open.kind === 'edit' && <DocumentEditDialog record={open.record} onSaved={saved} onClose={close} />}
      {open.kind === 'delete' && (
        <ConfirmDialog
          title="Delete this file?"
          message={`${open.record.originalName} will be removed for good, including the stored copy. This cannot be undone. Reports already made keep their own copy of the photo.`}
          confirmLabel="Delete" onClose={close}
          onConfirm={async () => { await apiFetch(`/documents/${open.record.id}`, { method: 'DELETE' }); saved('File deleted.'); }}
        />
      )}
    </div>
  );
}