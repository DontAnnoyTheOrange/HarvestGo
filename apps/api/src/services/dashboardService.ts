import { z } from 'zod';
import { currentQuarterInManila, quarterRange, type DashboardSummary } from '@harvestgo/shared';
import type { AuthContext } from '../types.js';
import { throwDbError } from '../utils/dbErrors.js';

const totals = z.object({
  harvest_kg: z.coerce.number(),
  harvest_pcs: z.coerce.number(),
  harvest_records: z.coerce.number(),
  sales_raw: z.coerce.number(),
  sales_value_added: z.coerce.number(),
  expenses_total: z.coerce.number(),
});

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** Adds up one quarter. The adding happens inside the database (as the logged-in person, so the security rules apply). */
export async function dashboardSummary(
  actor: AuthContext,
  query: { year?: number; quarter?: number },
): Promise<DashboardSummary> {
  const now = currentQuarterInManila();
  const year = query.year ?? now.year;
  const quarter = query.quarter ?? now.quarter;
  const { from, to } = quarterRange(year, quarter);

  const { data, error } = await actor.db.rpc('dashboard_summary', { p_from: from, p_to: to });
  if (error) throwDbError(error, 'Dashboard totals');
  const t = totals.parse(data);

  return {
    period: { year, quarter, from, to },
    harvest: { totalKg: round(t.harvest_kg, 3), totalPcs: round(t.harvest_pcs, 3), records: t.harvest_records },
    sales: {
      raw: round(t.sales_raw, 2),
      valueAdded: round(t.sales_value_added, 2),
      total: round(t.sales_raw + t.sales_value_added, 2), // gross revenue = raw + value-added (SRS 1.5)
    },
    expenses: { total: round(t.expenses_total, 2) },
  };
}