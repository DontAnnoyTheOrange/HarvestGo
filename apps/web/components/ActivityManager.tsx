'use client';

import { useEffect, useState } from 'react';
import {
  ACTIVITY_SORTS, SERVICE_TYPES, SERVICE_TYPE_LABELS, activityListSchema,
  type ActivityList, type ActivityRecord, type ActivitySort, type ServiceType,
} from '@harvestgo/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { showDate } from '@/lib/format';
import { useParticipantTypes } from '@/lib/useParticipantTypes';
import { ActivityFormDialog } from './ActivityFormDialog';
import { useCurrentUser } from './AppShell';
import { ConfirmDialog } from './ConfirmDialog';
import { inputClass, primaryButton, secondaryButton } from './Dialog';
import { Pagination } from './Pagination';

const PAGE_SIZE = 20;
const SORT_LABELS: Record<ActivitySort, string> = { date_desc: 'Newest first', date_asc: 'Oldest first' };
type StatusFilter = 'active' | 'archived' | 'all';

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: ActivityList };
type Open = { kind: 'none' } | { kind: 'create' } | { kind: 'edit'; record: ActivityRecord } | { kind: 'delete'; record: ActivityRecord };

export function ActivityManager() {
  const me = useCurrentUser();
  const isManager = me.role === 'general_manager';
  const types = useParticipantTypes();

  const [serviceType, setServiceType] = useState<ServiceType | ''>('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<ActivitySort>('date_desc');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [open, setOpen] = useState<Open>({ kind: 'none' });
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const filtered = serviceType !== '' || status !== 'active' || from !== '' || to !== '';

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sort, status });
    if (serviceType) params.set('serviceType', serviceType);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    apiFetch<unknown>(`/activities?${params}`)
      .then((raw) => {
        if (cancelled) return;
        const data = activityListSchema.parse(raw);
        const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
        if (data.records.length === 0 && page > pages) setPage(pages);
        else setLoad({ status: 'ready', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoad({ status: 'error', message: err instanceof Error ? err.message : 'Could not load activities.' });
      });
    return () => { cancelled = true; };
  }, [page, serviceType, status, from, to, sort, reloadKey]);

  const close = () => setOpen({ kind: 'none' });
  const saved = (message: string) => { close(); setProblem(null); setNotice(message); setReloadKey((k) => k + 1); };
  const changeFilter = (apply: () => void) => { apply(); setPage(1); setLoad({ status: 'loading' }); };
  const clearFilters = () => changeFilter(() => { setServiceType(''); setStatus('active'); setFrom(''); setTo(''); });
  const totalPages = load.status === 'ready' ? Math.max(1, Math.ceil(load.data.total / PAGE_SIZE)) : 1;

  async function toggleArchive(r: ActivityRecord) {
    setProblem(null);
    const next = r.status === 'active' ? 'archived' : 'active';
    try {
      await apiFetch(`/activities/${r.id}/status`, { method: 'PATCH', json: { status: next } });
      setNotice(next === 'archived' ? `"${r.title}" archived. Find it again under Status: Archived.` : `"${r.title}" is active again.`);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setProblem(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  const ready = types.state.status === 'ready';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-leaf-700">Activities</h1>
          <p className="text-leaf-900/70">Trainings, technical assistance and other services, with head-counts (ATI report Services Rendered).</p>
        </div>
        <button onClick={() => setOpen({ kind: 'create' })} disabled={!ready} className={primaryButton}>Record activity</button>
      </div>

      {notice && <p role="status" className="rounded-lg border-2 border-leaf-600 bg-leaf-50 p-3 font-medium">{notice}</p>}
      {problem && <p role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-3 font-medium text-red-900">{problem}</p>}
      {types.state.status === 'error' && (
        <p role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-red-900">
          Could not load the participant types. <button onClick={types.reload} className="underline">Try again</button>
        </p>
      )}

      <fieldset className="grid gap-3 rounded-xl border-2 border-leaf-100 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <legend className="px-2 text-sm font-semibold">Filter and sort</legend>
        <div>
          <label htmlFor="f-type" className="block text-sm font-medium">Kind of service</label>
          <select id="f-type" value={serviceType} onChange={(e) => changeFilter(() => setServiceType(e.target.value as ServiceType | ''))} className={inputClass}>
            <option value="">All kinds</option>
            {SERVICE_TYPES.map((t) => <option key={t} value={t}>{SERVICE_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-status" className="block text-sm font-medium">Status</label>
          <select id="f-status" value={status} onChange={(e) => changeFilter(() => setStatus(e.target.value as StatusFilter))} className={inputClass}>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
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

      {load.status === 'loading' && <p role="status" className="text-leaf-900/70">Loading activities...</p>}
      {load.status === 'error' && (
        <div role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-4 text-red-900">
          {load.message}
          <button onClick={() => { setLoad({ status: 'loading' }); setReloadKey((k) => k + 1); }} className={`${secondaryButton} ml-4`}>Try again</button>
        </div>
      )}

      {load.status === 'ready' && load.data.total === 0 && (
        <div className="rounded-xl border-2 border-dashed border-leaf-100 bg-white p-8 text-center">
          {filtered ? (<><p>No activities match these filters.</p><button onClick={clearFilters} className={`${secondaryButton} mt-3`}>Clear filters</button></>)
            : (<><p>No activities recorded yet.</p><button onClick={() => setOpen({ kind: 'create' })} disabled={!ready} className={`${primaryButton} mt-3`}>Record the first activity</button></>)}
        </div>
      )}

      {load.status === 'ready' && load.data.total > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border-2 border-leaf-100 bg-white">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <caption className="sr-only">Service activities</caption>
              <thead className="bg-leaf-50">
                <tr>
                  <th scope="col" className="p-3">Date</th>
                  <th scope="col" className="p-3">Activity</th>
                  <th scope="col" className="p-3">Participants</th>
                  <th scope="col" className="p-3">Status</th>
                  <th scope="col" className="p-3">Recorded by</th>
                  <th scope="col" className="p-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {load.data.records.map((r) => {
                  const canEdit = isManager || r.createdBy === me.id; // the server enforces this too
                  const present = r.attendance.filter((a) => a.male + a.female > 0).map((a) => a.participantTypeName);
                  return (
                    <tr key={r.id} className="border-t border-leaf-100 align-top">
                      <td className="whitespace-nowrap p-3">{showDate(r.activityDate)}</td>
                      <td className="p-3"><span className="font-medium">{r.title}</span><span className="block text-xs text-leaf-900/60">{SERVICE_TYPE_LABELS[r.serviceType]}</span></td>
                      <td className="p-3">
                        <span className="font-medium">{r.totals.male} male, {r.totals.female} female</span>
                        <span className="block text-xs">Total {r.totals.total}</span>
                        {present.length > 0 && <span className="block text-xs text-leaf-900/60">{present.join(', ')}</span>}
                      </td>
                      <td className="p-3"><span className={r.status === 'active' ? 'font-semibold text-leaf-700' : 'font-semibold text-amber-800'}>{r.status === 'active' ? 'Active' : 'Archived'}</span></td>
                      <td className="p-3">{r.createdByName}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          {canEdit && <button onClick={() => setOpen({ kind: 'edit', record: r })} className={secondaryButton} aria-label={`Edit ${r.title}`}>Edit</button>}
                          {canEdit && <button onClick={() => void toggleArchive(r)} className={secondaryButton} aria-label={`${r.status === 'active' ? 'Archive' : 'Unarchive'} ${r.title}`}>{r.status === 'active' ? 'Archive' : 'Unarchive'}</button>}
                          {isManager && <button onClick={() => setOpen({ kind: 'delete', record: r })} className={`${secondaryButton} !border-red-700 !text-red-700 hover:!bg-red-50`} aria-label={`Delete ${r.title}`}>Delete</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} total={load.data.total} noun="activity" onPage={setPage} />
        </>
      )}

      {open.kind === 'create' && types.state.status === 'ready' && <ActivityFormDialog types={types.state.data.participantTypes} onSaved={saved} onClose={close} />}
      {open.kind === 'edit' && types.state.status === 'ready' && <ActivityFormDialog record={open.record} types={types.state.data.participantTypes} onSaved={saved} onClose={close} />}
      {open.kind === 'delete' && (
        <ConfirmDialog
          title="Delete this activity?"
          message={`${open.record.title} (${showDate(open.record.activityDate)}) and its head-counts will be removed for good. Issues and photos linked to it will be kept but unlinked. To keep it out of the way without deleting, use Archive instead.`}
          confirmLabel="Delete" onClose={close}
          onConfirm={async () => { await apiFetch(`/activities/${open.record.id}`, { method: 'DELETE' }); saved('Activity deleted.'); }}
        />
      )}
    </div>
  );
}