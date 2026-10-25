'use client';

import { useEffect, useState } from 'react';
import { QUARTERS, activeTemplateSchema, currentQuarterInManila, reportListSchema, type ReportList, type ReportRecord } from '@harvestgo/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { QUARTER_LABELS } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import { useCurrentUser } from './AppShell';
import { ConfirmDialog } from './ConfirmDialog';
import { inputClass, primaryButton, secondaryButton } from './Dialog';
import { GenerateReportDialog } from './GenerateReportDialog';
import { Pagination } from './Pagination';
import { ReportDownloadDialog } from './ReportDownloadDialog';

const PAGE_SIZE = 20;
const size = (b: number | null) => (b === null ? '' : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: ReportList };
type Open = { kind: 'none' } | { kind: 'generate' } | { kind: 'download'; record: ReportRecord } | { kind: 'delete'; record: ReportRecord };

export function ReportManager() {
  const me = useCurrentUser();
  const isManager = me.role === 'general_manager';
  const template = useApi('/report-templates/active', activeTemplateSchema);
  const thisYear = currentQuarterInManila().year;
  const years = [thisYear, thisYear - 1, thisYear - 2, thisYear - 3];

  const [year, setYear] = useState('');
  const [quarter, setQuarter] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [open, setOpen] = useState<Open>({ kind: 'none' });
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const filtered = year !== '' || quarter !== '';

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (year) params.set('year', year);
    if (quarter) params.set('quarter', quarter);
    apiFetch<unknown>(`/reports?${params}`)
      .then((raw) => {
        if (cancelled) return;
        const data = reportListSchema.parse(raw);
        const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
        if (data.records.length === 0 && page > pages) setPage(pages);
        else setLoad({ status: 'ready', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoad({ status: 'error', message: err instanceof Error ? err.message : 'Could not load reports.' });
      });
    return () => { cancelled = true; };
  }, [page, year, quarter, reloadKey]);

  const close = () => setOpen({ kind: 'none' });
  const changeFilter = (apply: () => void) => { apply(); setPage(1); setLoad({ status: 'loading' }); };
  const totalPages = load.status === 'ready' ? Math.max(1, Math.ceil(load.data.total / PAGE_SIZE)) : 1;

  async function setUpOfficial() {
    setSettingUp(true);
    setProblem(null);
    try {
      await apiFetch('/report-templates/official', { method: 'POST' });
      setNotice('The official ATI template is set up. You can now make reports.');
      template.reload();
    } catch (err) {
      setProblem(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSettingUp(false);
    }
  }

  const active = template.state.status === 'ready' ? template.state.data.template : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-leaf-700">Reports</h1>
          <p className="text-leaf-900/70">Quarterly Accomplishment Reports for DA-ATI RTC IV-A (form ATI-QF/PAD-119). Made from your records.</p>
        </div>
        <button onClick={() => { setNotice(null); setOpen({ kind: 'generate' }); }} disabled={!active} className={primaryButton}>Make a report</button>
      </div>

      {notice && <p role="status" className="rounded-lg border-2 border-leaf-600 bg-leaf-50 p-3 font-medium">{notice}</p>}
      {problem && <p role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-3 font-medium text-red-900">{problem}</p>}

      {template.state.status === 'error' && (
        <p role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-red-900">
          {template.state.message} <button onClick={template.reload} className="underline">Try again</button>
        </p>
      )}
      {template.state.status === 'ready' && !active && (
        <div role="note" className="rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-amber-900">
          <p className="font-semibold">No report template is set up yet.</p>
          {isManager ? (
            <>
              <p className="mt-1 text-sm">The template is the layout of the PDF. Set up the official ATI-QF/PAD-119 layout to start making reports.</p>
              <button onClick={() => void setUpOfficial()} disabled={settingUp} className={`${primaryButton} mt-3`}>{settingUp ? 'Setting up...' : 'Set up the official ATI template'}</button>
            </>
          ) : (
            <p className="mt-1 text-sm">Please ask the General Manager to set up the official template.</p>
          )}
        </div>
      )}
      {active && <p className="text-sm text-leaf-900/60">Layout in use: {active.name}, version {active.version}.</p>}

      <fieldset className="grid gap-3 rounded-xl border-2 border-leaf-100 bg-white p-4 sm:grid-cols-3">
        <legend className="px-2 text-sm font-semibold">Filter</legend>
        <div>
          <label htmlFor="f-year" className="block text-sm font-medium">Year</label>
          <select id="f-year" value={year} onChange={(e) => changeFilter(() => setYear(e.target.value))} className={inputClass}>
            <option value="">All years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-quarter" className="block text-sm font-medium">Quarter</label>
          <select id="f-quarter" value={quarter} onChange={(e) => changeFilter(() => setQuarter(e.target.value))} className={inputClass}>
            <option value="">All quarters</option>
            {QUARTERS.map((q) => <option key={q} value={q}>{QUARTER_LABELS[q]}</option>)}
          </select>
        </div>
        {filtered && <div className="flex items-end"><button onClick={() => changeFilter(() => { setYear(''); setQuarter(''); })} className={secondaryButton}>Clear filters</button></div>}
      </fieldset>

      {load.status === 'loading' && <p role="status" className="text-leaf-900/70">Loading reports...</p>}
      {load.status === 'error' && (
        <div role="alert" className="rounded-lg border-2 border-red-600 bg-red-50 p-4 text-red-900">
          {load.message}
          <button onClick={() => { setLoad({ status: 'loading' }); setReloadKey((k) => k + 1); }} className={`${secondaryButton} ml-4`}>Try again</button>
        </div>
      )}

      {load.status === 'ready' && load.data.total === 0 && (
        <div className="rounded-xl border-2 border-dashed border-leaf-100 bg-white p-8 text-center">
          {filtered ? <p>No reports match these filters.</p> : <p>No reports have been made yet.</p>}
        </div>
      )}

      {load.status === 'ready' && load.data.total > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border-2 border-leaf-100 bg-white">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <caption className="sr-only">Report history</caption>
              <thead className="bg-leaf-50">
                <tr>
                  <th scope="col" className="p-3">Quarter</th>
                  <th scope="col" className="p-3">Made on</th>
                  <th scope="col" className="p-3">Made by</th>
                  <th scope="col" className="p-3">Layout</th>
                  <th scope="col" className="p-3 text-right">Photos</th>
                  <th scope="col" className="p-3 text-right">Size</th>
                  <th scope="col" className="p-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {load.data.records.map((r) => {
                  const label = `Q${r.periodQuarter} ${r.periodYear} report made on ${when(r.generatedAt)}`;
                  return (
                    <tr key={r.id} className="border-t border-leaf-100 align-top">
                      <td className="whitespace-nowrap p-3 font-medium">Q{r.periodQuarter} {r.periodYear}</td>
                      <td className="whitespace-nowrap p-3">{when(r.generatedAt)}</td>
                      <td className="p-3">{r.generatedByName}</td>
                      <td className="p-3 text-xs">{r.templateName}<span className="block text-leaf-900/60">version {r.templateVersion}</span></td>
                      <td className="p-3 text-right">{r.photoCount}</td>
                      <td className="whitespace-nowrap p-3 text-right">{size(r.sizeBytes)}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button onClick={() => setOpen({ kind: 'download', record: r })} className={secondaryButton} aria-label={`Download ${label}`}>Download</button>
                          {isManager && <button onClick={() => setOpen({ kind: 'delete', record: r })} className={`${secondaryButton} !border-red-700 !text-red-700 hover:!bg-red-50`} aria-label={`Delete ${label}`}>Delete</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} total={load.data.total} noun="report" onPage={setPage} />
        </>
      )}

      {open.kind === 'generate' && active && (
        <GenerateReportDialog
          template={active}
          onClose={close}
          onDone={(record) => {
            setNotice(`The Q${record.periodQuarter} ${record.periodYear} report is ready.`);
            setReloadKey((k) => k + 1);
            setOpen({ kind: 'download', record });
          }}
        />
      )}
      {open.kind === 'download' && <ReportDownloadDialog record={open.record} onClose={close} />}
      {open.kind === 'delete' && (
        <ConfirmDialog
          title="Delete this report?"
          message={`The Q${open.record.periodQuarter} ${open.record.periodYear} report made on ${when(open.record.generatedAt)} will be removed for good, including the stored PDF. Copies you already downloaded are not affected.`}
          confirmLabel="Delete" onClose={close}
          onConfirm={async () => { await apiFetch(`/reports/${open.record.id}`, { method: 'DELETE' }); close(); setNotice('Report deleted.'); setReloadKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}