'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import {
  QUARTERS, currentQuarterInManila, dashboardSummarySchema, expenseListSchema, harvestListSchema, saleListSchema,
  type Quarter,
} from '@harvestgo/shared';
import { amount3, peso, QUARTER_LABELS, showDate } from '@/lib/format';
import { useApi, type ApiState } from '@/lib/useApi';
import { useCurrentUser } from './AppShell';
import { inputClass, secondaryButton } from './Dialog';

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl border-2 border-leaf-100 bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-leaf-900/70">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Status<T>({ state, children, retry }: { state: ApiState<T>; children: (data: T) => ReactNode; retry: () => void }) {
  if (state.status === 'loading') return <p role="status" className="text-sm text-leaf-900/60">Loading...</p>;
  if (state.status === 'error') {
    return (
      <p role="alert" className="text-sm text-red-800">
        {state.message} <button onClick={retry} className="underline">Try again</button>
      </p>
    );
  }
  return <>{children(state.data)}</>;
}

function RecentList({ title, href, rows }: { title: string; href: string; rows: { key: string; main: string; sub: string; value: string }[] }) {
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-leaf-900/60">Nothing recorded yet.</p>
      ) : (
        <ul className="divide-y divide-leaf-100 text-sm">
          {rows.map((r) => (
            <li key={r.key} className="flex items-start justify-between gap-3 py-2">
              <span><span className="font-medium">{r.main}</span><span className="block text-xs text-leaf-900/60">{r.sub}</span></span>
              <span className="whitespace-nowrap font-medium">{r.value}</span>
            </li>
          ))}
        </ul>
      )}
      <Link href={href} className="mt-3 inline-block text-sm font-semibold text-leaf-700 underline">View all</Link>
    </Card>
  );
}

export function DashboardHome() {
  const user = useCurrentUser();
  const now = currentQuarterInManila();
  const [year, setYear] = useState(now.year);
  const [quarter, setQuarter] = useState<Quarter>(now.quarter);
  const years = [now.year, now.year - 1, now.year - 2, now.year - 3];

  const summary = useApi(`/dashboard/summary?year=${year}&quarter=${quarter}`, dashboardSummarySchema);
  const harvests = useApi('/harvests?pageSize=5&sort=date_desc', harvestListSchema);
  const sales = useApi('/sales?pageSize=5&sort=date_desc', saleListSchema);
  const expenses = useApi('/expenses?pageSize=5&sort=date_desc', expenseListSchema);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-leaf-700">Welcome, {user.fullName}</h1>
          <p className="text-leaf-900/70">Totals for the quarter you choose. Everything here is added up from the records.</p>
        </div>
        <div className="flex gap-3">
          <div>
            <label htmlFor="d-year" className="block text-sm font-medium">Year</label>
            <select id="d-year" value={year} onChange={(e) => setYear(Number(e.target.value))} className={inputClass}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="d-quarter" className="block text-sm font-medium">Quarter</label>
            <select id="d-quarter" value={quarter} onChange={(e) => setQuarter(Number(e.target.value) as Quarter)} className={inputClass}>
              {QUARTERS.map((q) => <option key={q} value={q}>{QUARTER_LABELS[q]}</option>)}
            </select>
          </div>
        </div>
      </div>

      <Status state={summary.state} retry={summary.reload}>
        {(s) => (
          <div className="grid gap-4 md:grid-cols-3">
            <Card title="Gross revenue">
              <p className="text-3xl font-bold text-leaf-700">{peso.format(s.sales.total)}</p>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between"><dt>Raw produce</dt><dd className="font-medium">{peso.format(s.sales.raw)}</dd></div>
                <div className="flex justify-between"><dt>Value-added</dt><dd className="font-medium">{peso.format(s.sales.valueAdded)}</dd></div>
              </dl>
            </Card>
            <Card title="Expenses">
              <p className="text-3xl font-bold text-leaf-700">{peso.format(s.expenses.total)}</p>
              <p className="mt-2 text-sm text-leaf-900/70">Money spent on crops this quarter.</p>
            </Card>
            <Card title="Harvest">
              <p className="text-3xl font-bold text-leaf-700">{amount3.format(s.harvest.totalKg)} kg</p>
              <p className="mt-2 text-sm">
                {s.harvest.totalPcs > 0 && <span>plus {amount3.format(s.harvest.totalPcs)} pcs. </span>}
                <span className="text-leaf-900/70">{s.harvest.records} record{s.harvest.records === 1 ? '' : 's'}.</span>
              </p>
            </Card>
            <p className="text-xs text-leaf-900/60 md:col-span-3">
              {showDate(s.period.from)} to {showDate(s.period.to)}. Gross revenue is raw plus value-added sales (expenses are not deducted).
            </p>
          </div>
        )}
      </Status>

      <h2 className="text-xl font-semibold">Latest records</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <Status state={harvests.state} retry={harvests.reload}>
          {(d) => <RecentList title="Harvests" href="/harvests" rows={d.records.map((r) => ({ key: r.id, main: r.cropName, sub: showDate(r.harvestDate), value: `${amount3.format(r.quantity)} ${r.unit}` }))} />}
        </Status>
        <Status state={sales.state} retry={sales.reload}>
          {(d) => <RecentList title="Sales" href="/sales" rows={d.records.map((r) => ({ key: r.id, main: r.productName ?? r.cropName, sub: showDate(r.saleDate), value: peso.format(r.amount) }))} />}
        </Status>
        <Status state={expenses.state} retry={expenses.reload}>
          {(d) => <RecentList title="Expenses" href="/expenses" rows={d.records.map((r) => ({ key: r.id, main: r.description, sub: `${r.cropName}, ${showDate(r.expenseDate)}`, value: peso.format(r.amount) }))} />}
        </Status>
      </div>

      <button onClick={() => { summary.reload(); harvests.reload(); sales.reload(); expenses.reload(); }} className={secondaryButton}>Refresh</button>
    </div>
  );
}