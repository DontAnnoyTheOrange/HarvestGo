/** Shared ways of showing money, numbers and dates (same look on every screen). */
export const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
export const amount3 = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 });

/** 2026-06-10 -> "Jun 10, 2026" (built by hand so the time zone can never shift the day). */
export function showDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

export const QUARTER_LABELS: Record<number, string> = {
  1: 'Q1 (Jan to Mar)',
  2: 'Q2 (Apr to Jun)',
  3: 'Q3 (Jul to Sep)',
  4: 'Q4 (Oct to Dec)',
};