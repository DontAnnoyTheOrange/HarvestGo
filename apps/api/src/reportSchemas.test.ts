import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_TEMPLATE_CONFIG, generateReportSchema, listReportsQuery, previewReportQuery, reportDataSchema,
  reportTemplateConfigSchema, reportTemplateDocumentSchema,
} from '@harvestgo/shared';

const photo = '3f2a4d3e-6a52-4b52-9a4e-1c2d3e4f5a6b';
const clone = () => structuredClone(OFFICIAL_TEMPLATE_CONFIG);
const makeTemplateDocument = () => ({
  schemaVersion: 2,
  name: 'Quarterly report',
  farm: { name: 'Kabutihan Farm', shortName: 'Kabutihan' },
  logoPath: null,
  pages: [{
    id: 'overview',
    name: 'Overview',
    settings: { size: 'long', orientation: 'landscape', margins: { top: 10, right: 12, bottom: 10, left: 12 } },
    layout: { mode: 'hybrid', columns: 2, gapMm: 6 },
    backgroundColor: null,
    border: { enabled: false, color: '#000000', widthMm: 0 },
    header: { enabled: true, lines: ['Kabutihan Farm'], alignment: 'center', showLogo: true, showPageNumber: false },
    footer: { enabled: true, lines: ['ATI quarterly report'], alignment: 'right', showLogo: false, showPageNumber: true },
    elements: [
      {
        id: 'title',
        type: 'report_title',
        text: 'Quarterly Accomplishment Report',
        placement: { mode: 'flow', column: 0, columnSpan: 2 },
        fontSizePt: 20,
      },
      {
        id: 'yield',
        type: 'table',
        binding: 'report.yield',
        columns: [
          { field: 'crop', label: 'Crop', widthPercent: 70, alignment: 'left', visible: true },
          { field: 'kg', label: 'Yield (kg)', widthPercent: 30, alignment: 'right', visible: true },
        ],
        placement: { mode: 'flow', column: 0, columnSpan: 2 },
        fontSizePt: 9,
        headerBackground: '#EEEEEE',
        headerColor: '#000000',
        repeatHeader: true,
        rowBehavior: 'allow-split',
        emptyText: 'No yield recorded.',
      },
      {
        id: 'photos',
        type: 'photo_group',
        binding: 'report.photos',
        placement: { mode: 'flow', column: 0, columnSpan: 2 },
        startIndex: 0,
        columns: 3,
        imageHeightMm: 70,
        fit: 'contain',
        alignment: 'center',
        showCaptions: true,
        maxPhotos: 12,
        continueAcrossPages: true,
      },
      {
        id: 'positioned-note',
        type: 'static_label',
        text: 'Prepared for review',
        placement: { mode: 'positioned', x: 65, y: 80, width: 30, height: 10 },
        fontSizePt: 8,
      },
      {
        id: 'quarter',
        type: 'dynamic_field',
        binding: 'report.quarter',
        placement: { mode: 'flow', column: 1, columnSpan: 1 },
        prefix: 'Quarter ',
        suffix: '',
        fontSizePt: 10,
      },
    ],
  }],
});

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

describe('the v2 structured template document', () => {
  it('accepts page-specific settings and hybrid flow/position-ready content', () => {
    const parsed = reportTemplateDocumentSchema.safeParse(makeTemplateDocument());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.schemaVersion).toBe(2);
      expect(parsed.data.pages[0]?.settings.orientation).toBe('landscape');
      expect(parsed.data.pages[0]?.elements.map((element) => element.id)).toEqual(['title', 'yield', 'photos', 'positioned-note', 'quarter']);
    }
  });

  it('keeps individual page order and page-specific settings', () => {
    const document = JSON.parse(JSON.stringify(makeTemplateDocument()));
    document.pages.push({
      ...document.pages[0]!,
      id: 'appendix',
      name: 'Appendix',
      settings: {
        ...document.pages[0]!.settings,
        orientation: 'portrait',
        margins: { top: 15, right: 15, bottom: 15, left: 15 },
      },
      backgroundColor: '#F8F8F8',
      elements: [],
    });

    const parsed = reportTemplateDocumentSchema.parse(document);
    expect(parsed.pages.map((page) => page.id)).toEqual(['overview', 'appendix']);
    expect(parsed.pages[1]?.settings.orientation).toBe('portrait');
    expect(parsed.pages[1]?.backgroundColor).toBe('#F8F8F8');
  });

  it('rejects unsupported bindings and table columns that do not belong to their data source', () => {
    const unsupported = makeTemplateDocument();
    (unsupported.pages[0]!.elements[1] as { binding: string }).binding = 'report.arbitrary';
    expect(reportTemplateDocumentSchema.safeParse(unsupported).success).toBe(false);

    const unsupportedDynamic = JSON.parse(JSON.stringify(makeTemplateDocument()));
    unsupportedDynamic.pages[0].elements[4].binding = 'report.secret';
    expect(reportTemplateDocumentSchema.safeParse(unsupportedDynamic).success).toBe(false);

    const mismatchedColumn = makeTemplateDocument();
    (mismatchedColumn.pages[0]!.elements[1] as { columns: { field: string }[] }).columns[0]!.field = 'problem';
    expect(reportTemplateDocumentSchema.safeParse(mismatchedColumn).success).toBe(false);
  });

  it('rejects missing required table settings and unsupported schema versions', () => {
    const missingColumns = makeTemplateDocument();
    delete (missingColumns.pages[0]!.elements[1] as { columns?: unknown }).columns;
    expect(reportTemplateDocumentSchema.safeParse(missingColumns).success).toBe(false);

    const unsupportedVersion = makeTemplateDocument();
    (unsupportedVersion as { schemaVersion: number }).schemaVersion = 3;
    expect(reportTemplateDocumentSchema.safeParse(unsupportedVersion).success).toBe(false);
  });

  it('rejects duplicate IDs, invalid page margins, and elements outside the page content area', () => {
    const duplicateId = makeTemplateDocument();
    duplicateId.pages[0]!.elements[1]!.id = 'title';
    expect(reportTemplateDocumentSchema.safeParse(duplicateId).success).toBe(false);

    const invalidMargins = makeTemplateDocument();
    invalidMargins.pages[0]!.settings.margins.left = 200;
    invalidMargins.pages[0]!.settings.margins.right = 200;
    expect(reportTemplateDocumentSchema.safeParse(invalidMargins).success).toBe(false);

    const outOfBounds = JSON.parse(JSON.stringify(makeTemplateDocument())) as {
      pages: { layout: { mode: string }; elements: Array<{ id: string; type: string; [key: string]: unknown }> }[];
    };
    outOfBounds.pages[0]!.layout.mode = 'hybrid';
    outOfBounds.pages[0]!.elements.push({
      id: 'positioned',
      type: 'paragraph',
      text: 'Outside the page',
      placement: { mode: 'positioned', x: 80, y: 80, width: 30, height: 30 },
    });
    expect(reportTemplateDocumentSchema.safeParse(outOfBounds).success).toBe(false);
  });

  it('rejects overlapping positioned elements and oversized table columns', () => {
    const overlap = JSON.parse(JSON.stringify(makeTemplateDocument())) as {
      pages: { elements: Array<{ id: string; type: string; [key: string]: unknown }> }[];
    };
    overlap.pages[0]!.elements.push({
      id: 'overlapping-note',
      type: 'static_label',
      text: 'Overlaps',
      placement: { mode: 'positioned', x: 70, y: 85, width: 20, height: 10 },
    });
    expect(reportTemplateDocumentSchema.safeParse(overlap).success).toBe(false);

    const wideTable = makeTemplateDocument();
    (wideTable.pages[0]!.elements[1] as { columns: { widthPercent: number }[] }).columns[1]!.widthPercent = 40;
    expect(reportTemplateDocumentSchema.safeParse(wideTable).success).toBe(false);
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