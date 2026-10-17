'use client';

import { useEffect, useState } from 'react';
import { ACTIVITY_SORTS, issueListSchema, type ActivitySort, type IssueList, type IssueRecord } from '@harvestgo/shared';
import { apiFetch } from '@/lib/api';
import { showDate } from '@/lib/format';
import { useCrops } from '@/lib/useCrops';
import { useCurrentUser } from './AppShell';
import { ConfirmDialog } from './ConfirmDialog';
import { inputClass, primaryButton, secondaryButton } from './Dialog';
import { IssueFormDialog } from './IssueFormDialog';
import { Pagination } from './Pagination';

const PAGE_SIZE = 20;
const SORT_LABELS: Record<ActivitySort, string> = { date_desc: 'Newest first', date_asc: 'Oldest first' };

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: IssueList };
type Open = { kind: 'none' } | { kind: 'create' } | { kind: 'edit'; record: IssueRecord } | { kind: 'delete'; record: IssueRecord };

export function IssueManager() {
  const me = useCurrentUser();
  const isManager = me.role === 'general_manager';
  const crops = useCrops(true);

  const [cropId, setCropId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<ActivitySort>('date_desc');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [open, setOpen] = useState<Open>({ kind: 'none' });
  const [notice, setNotice] = useState<string | null>(null);
  const filtered = cropId !== '' || from !== '' || to !== '';

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sort });
    if (cropId) params.set('cropId', cropId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    apiFetch<unknown>(`/issues?${params}`)
      .then((raw) => {
        if (cancelled) return;
        const data = issueListSchema.parse(raw);
        const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
        if (data.records.length === 0 && page > pages) setPage(pages);
        else setLoad({ status: 'ready', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoad({ status: 'error', message: err instanceof Error ? err.message : 'Could not load issues.' });
      });
    return () => { cancelled = true; };
  }, [page, cropId, from, to, sort, reloadKey]);

  const close = () => setOpen({ kind: 'none' });
  const saved = (message: string) => { close(); setNotice(message); setReloadKey((k) => k + 1); };
  const changeFilter = (apply: () => void) => { apply(); setPage(1); setLoad({ status: 'loading' }); };
  const clearFilters = () => changeFilter(() => { setCropId(''); setFrom(''); setTo(''); });
  const totalPages = load.status === 'ready' ? Math.max(1, Math.ceil(load.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-leaf-700">Issues</h1>
          <p className="text-leaf-900/70">Problems met, actions taken and recommendations (ATI report Section E).</p>
        </div>
        <button onClick={() => setOpen({ kind: 'create' })} className={primaryButton}>Record issue</button>
      </div>

      {notice && <p role="status" className="rounded-lg border-2 border-leaf-600 bg-leaf-50 p-3 font-medium">{notice}</p>}

      <fieldset className="grid gap-3 rounded-xl border-2 border-leaf-100 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <legend className="px-2 text-sm font-semibold">Filter and sort</legend>
        <div className="lg:col-span-2">
          <label htmlFor="f-crop" className="block text-sm font-medium">Crop</label>
          <select id="f-crop" value={cropId} onChange={(e) => changeFilter(() => setCropId(e.target.value))} className={inputClass}>
            <option value="">All crops</option>
            {crops.state.status === 'ready' && crops.state.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
          <select id="f-sort" value={sort} onChange={(e) => changeFilter(() => setSort(e.target.value as ActivitySort))} className={inputClass}>
            {ACTIVITY_SORTS.map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
          </select>
        </div>
        {filtered && <div className="sm:col-span-2 lg:col-span-5"><button onClick={clearFilters} className={secondaryButton}>Clear filters</button></div>}
      </fieldset>

      {load.status === 'loading' && <p role="status" className="text-leaf-900/70">Loading issues...</p>}
      {load.status === 'error' && (
        <div role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-4 text-red-900">
          {load.message}
          <button onClick={() => { setLoad({ status: 'loading' }); setReloadKey((k) => k + 1); }} className={`${secondaryButton} ml-4`}>Try again</button>
        </div>
      )}

      {load.status === 'ready' && load.data.total === 0 && (
        <div className="rounded-xl border-2 border-dashed border-leaf-100 bg-white p-8 text-center">
          {filtered ? (<><p>No issues match these filters.</p><button onClick={clearFilters} className={`${secondaryButton} mt-3`}>Clear filters</button></>)
            : (<><p>No issues recorded yet.</p><button onClick={() => setOpen({ kind: 'create' })} className={`${primaryButton} mt-3`}>Record the first issue</button></>)}
        </div>
      )}

      {load.status === 'ready' && load.data.total > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border-2 border-leaf-100 bg-white">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <caption className="sr-only">Problems, actions taken and recommendations</caption>
              <thead className="bg-leaf-50">
                <tr>
                  <th scope="col" className="p-3">Date</th>
                  <th scope="col" className="p-3">Problem / difficulty</th>
                  <th scope="col" className="p-3">Action taken</th>
                  <th scope="col" className="p-3">Recommendation</th>
                  <th scope="col" className="p-3">About</th>
                  <th scope="col" className="p-3">Recorded by</th>
                  <th scope="col" className="p-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {load.data.records.map((r) => {
                  const canEdit = isManager || r.createdBy === me.id; // the server enforces this too
                  return (
                    <tr key={r.id} className="border-t border-leaf-100 align-top">
                      <td className="whitespace-nowrap p-3">{showDate(r.issueDate)}</td>
                      <td className="max-w-xs p-3 font-medium">{r.problem}</td>
                      <td className="max-w-xs p-3">{r.actionTaken ?? ''}</td>
                      <td className="max-w-xs p-3">{r.recommendation ?? ''}</td>
                      <td className="p-3 text-xs">
                        {r.cropName && <span className="block">Crop: {r.cropName}</span>}
                        {r.activityTitle && <span className="block">Activity: {r.activityTitle}</span>}
                      </td>
                      <td className="p-3">{r.createdByName}</td>
                      <td className="p-3">
                        <div className="flex justify-end gap-2">
                          {canEdit && <button onClick={() => setOpen({ kind: 'edit', record: r })} className={secondaryButton} aria-label={`Edit issue of ${showDate(r.issueDate)}`}>Edit</button>}
                          {isManager && <button onClick={() => setOpen({ kind: 'delete', record: r })} className={`${secondaryButton} !border-red-700 !text-red-700 hover:!bg-red-50`} aria-label={`Delete issue of ${showDate(r.issueDate)}`}>Delete</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} total={load.data.total} noun="issue" onPage={setPage} />
        </>
      )}

      {open.kind === 'create' && crops.state.status === 'ready' && <IssueFormDialog crops={crops.state.items} onSaved={saved} onClose={close} />}
      {open.kind === 'edit' && crops.state.status === 'ready' && <IssueFormDialog record={open.record} crops={crops.state.items} onSaved={saved} onClose={close} />}
      {open.kind === 'delete' && (
        <ConfirmDialog
          title="Delete this issue?"
          message={`"${open.record.problem.slice(0, 80)}" from ${showDate(open.record.issueDate)}. This cannot be undone.`}
          confirmLabel="Delete" onClose={close}
          onConfirm={async () => { await apiFetch(`/issues/${open.record.id}`, { method: 'DELETE' }); saved('Issue deleted.'); }}
        />
      )}
    </div>
  );
}