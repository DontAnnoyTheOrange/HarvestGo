import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_TEMPLATE_CONFIG, generateReportSchema, listReportsQuery, previewReportQuery, reportDataSchema, reportTemplateConfigSchema,
} from '@harvestgo/shared';

const photo = '3f2a4d3e-6a52-4b52-9a4e-1c2d3e4f5a6b';
const clone = () => structuredClone(OFFICIAL_TEMPLATE_CONFIG);

describe('the official template', () => {
  it('is itself valid (so the "set up official template" button can never save a broken layout)', () => {
    expect(reportTemplateConfigSchema.safeParse(OFFICIAL_TEMPLATE_CONFIG).success).toBe(true);
  });

  it('matches the paper and wording of form ATI-QF/PAD-119 Rev. 00', () => {
    const c = OFFICIAL_TEMPLATE_CONFIG;
    expect(c.page).toEqual({ size: 'long', orientation: 'landscape' });
    expect(c.reportTitle).toBe('QUARTERLY ACCOMPLISHMENT REPORT');
    expect(c.footerText).toContain('ATI-QF/PAD-119 Rev. 00');
    expect(c.header.lines).toContain('Regional Training Center IV-A');
    expect(c.production.title).toBe('A. PRODUCTION DATA');
    expect(c.photos.title).toBe('G. PHOTO DOCUMENTATION'); // the form really skips section F
    expect(c.signature.name).toBe(''); // a blank line to sign by hand, no person's name built in
  });

  it.each([
    ['unknown paper size', (c: ReturnType<typeof clone>) => { (c.page as { size: string }).size = 'poster'; }],
    ['too many photo columns', (c: ReturnType<typeof clone>) => { c.photos.columns = 9; }],
    ['zero photos allowed', (c: ReturnType<typeof clone>) => { c.photos.maxPhotos = 0; }],
    ['a very long title', (c: ReturnType<typeof clone>) => { c.reportTitle = 'x'.repeat(500); }],
    ['too many header lines', (c: ReturnType<typeof clone>) => { c.header.lines = Array(9).fill('x'); }],
    ['wrong settings version', (c: ReturnType<typeof clone>) => { (c as { schemaVersion: number }).schemaVersion = 2; }],
    ['unknown date mode', (c: ReturnType<typeof clone>) => { (c.signature as { dateMode: string }).dateMode = 'someday'; }],
  ])('refuses %s', (_label, change) => {
    const c = clone();
    change(c);
    expect(reportTemplateConfigSchema.safeParse(c).success).toBe(false);
  });
});

describe('making a report: the request', () => {
  it('accepts a quarter with no photos, or with photos', () => {
    expect(generateReportSchema.safeParse({ year: 2026, quarter: 2, photoIds: [] }).success).toBe(true);
    expect(generateReportSchema.safeParse({ year: 2026, quarter: 2, photoIds: [photo] }).success).toBe(true);
  });
  it.each([
    ['quarter 0', { quarter: 0 }],
    ['quarter 5', { quarter: 5 }],
    ['year 1999', { year: 1999 }],
    ['a made-up photo id', { photoIds: ['banana'] }],
    ['the same photo twice', { photoIds: [photo, photo] }],
    ['13 photos', { photoIds: Array.from({ length: 13 }, (_, i) => `3f2a4d3e-6a52-4b52-9a4e-1c2d3e4f5a${String(i).padStart(2, '0')}`) }],
  ])('refuses %s', (_label, bad) => {
    expect(generateReportSchema.safeParse({ year: 2026, quarter: 2, photoIds: [], ...bad }).success).toBe(false);
  });
  it('reads year and quarter from an address, and rejects nonsense', () => {
    expect(previewReportQuery.parse({ year: '2026', quarter: '3' })).toEqual({ year: 2026, quarter: 3 });
    expect(previewReportQuery.safeParse({ year: '2026', quarter: '9' }).success).toBe(false);
    expect(listReportsQuery.safeParse({ pageSize: '5000' }).success).toBe(false);
    expect(listReportsQuery.parse({}).pageSize).toBe(20);
  });
});

describe('quarter data from the database', () => {
  it('reads numbers that arrive as text (the database sends exact decimals)', () => {
    const r = reportDataSchema.parse({
      from: '2025-04-01', to: '2025-06-30', categories: ['Vegetables'], services: [], participantTypes: [],
      yield: [{ category: 'Vegetables', crop: 'Sitaw', kg: '0.80000000000000000000', pcs: 0 }],
      cost: [{ category: 'Vegetables', label: 'Sitaw', amount: '96.00' }], sales: [], income: [], issues: [],
    });
    expect(r.yield[0]?.kg).toBe(0.8);
    expect(r.cost[0]?.amount).toBe(96);
  });
  it('refuses data in the wrong shape', () => {
    expect(reportDataSchema.safeParse({ from: '2025-04-01' }).success).toBe(false);
  });
});