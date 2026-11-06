import { describe, expect, it } from 'vitest';
import { reportTemplateDocumentSchema, type ReportData, type ReportTemplateDocument } from '@harvestgo/shared';
import { renderReportDocumentHtml } from './documentRenderer.js';

const data: ReportData = {
  from: '2026-04-01',
  to: '2026-06-30',
  categories: ['Vegetables'],
  services: [{ serviceType: 'training', activities: 1, titles: ['Farm safety session'], male: 8, female: 12 }],
  participantTypes: ['Farmers'],
  yield: [{ category: 'Vegetables', crop: 'Mushroom', kg: 12.5, pcs: 0 }],
  cost: [{ category: 'Vegetables', label: 'Mushroom', amount: 1250 }],
  sales: [],
  income: [],
  issues: [{ date: '2026-06-01', problem: 'Broken irrigation pipe', actionTaken: 'Repaired the pipe', recommendation: 'Keep spare fittings' }],
};

function documentFixture(): ReportTemplateDocument {
  return reportTemplateDocumentSchema.parse({
    schemaVersion: 2,
    name: 'Flexible farm report',
    farm: { name: 'Kabutihan Farm', shortName: 'Kabutihan' },
    logoPath: null,
    pages: [
      {
        id: 'overview',
        name: 'Overview',
        settings: { size: 'letter', orientation: 'portrait', margins: { top: 16, right: 12, bottom: 14, left: 12 } },
        layout: { mode: 'hybrid', columns: 2, gapMm: 5 },
        backgroundColor: '#FAFAFA',
        border: { enabled: true, color: '#333333', widthMm: 0.5 },
        header: { enabled: true, lines: ['Kabutihan Farm', 'Quarterly report'], alignment: 'center', showLogo: false, showPageNumber: false },
        footer: { enabled: true, lines: ['Internal report'], alignment: 'right', showLogo: false, showPageNumber: true },
        elements: [
          {
            id: 'title',
            type: 'report_title',
            text: 'Quarterly Accomplishment Report',
            placement: { mode: 'flow', column: 0, columnSpan: 2 },
            fontSizePt: 18,
            bold: true,
            alignment: 'center',
          },
          {
            id: 'quarter',
            type: 'dynamic_field',
            binding: 'report.quarter',
            prefix: 'Quarter ',
            suffix: ' / 2026',
            placement: { mode: 'flow', column: 0, columnSpan: 2 },
            fontSizePt: 10,
          },
          {
            id: 'farm-name',
            type: 'dynamic_field',
            binding: 'farm.name',
            prefix: 'Farm: ',
            placement: { mode: 'flow', column: 0, columnSpan: 2 },
            fontSizePt: 10,
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
          { id: 'next-page', type: 'page_break' },
          {
            id: 'photos',
            type: 'photo_group',
            binding: 'report.photos',
            startIndex: 0,
            columns: 2,
            imageHeightMm: 65,
            fit: 'contain',
            alignment: 'center',
            showCaptions: true,
            maxPhotos: 12,
            continueAcrossPages: true,
            placement: { mode: 'flow', column: 0, columnSpan: 2 },
          },
        ],
      },
      {
        id: 'issues',
        name: 'Issues',
        settings: { size: 'long', orientation: 'landscape', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
        layout: { mode: 'flow', columns: 1, gapMm: 0 },
        backgroundColor: null,
        border: { enabled: false, color: '#000000', widthMm: 0 },
        header: { enabled: false, lines: [], alignment: 'left', showLogo: false, showPageNumber: false },
        footer: { enabled: true, lines: ['Issues page'], alignment: 'center', showLogo: false, showPageNumber: false },
        elements: [
          {
            id: 'issues-table',
            type: 'table',
            binding: 'report.issues',
            columns: [
              { field: 'date', label: 'Date', widthPercent: 15, alignment: 'left', visible: true },
              { field: 'problem', label: 'Problem', widthPercent: 35, alignment: 'left', visible: true },
              { field: 'actionTaken', label: 'Action', widthPercent: 25, alignment: 'left', visible: true },
              { field: 'recommendation', label: 'Recommendation', widthPercent: 25, alignment: 'left', visible: true },
            ],
            placement: { mode: 'flow', column: 0, columnSpan: 1 },
            fontSizePt: 9,
            headerBackground: '#E4EFE4',
            headerColor: '#000000',
            repeatHeader: true,
            rowBehavior: 'keep-together',
            emptyText: 'No issues recorded.',
          },
          {
            id: 'participant-types',
            type: 'table',
            binding: 'report.participantTypes',
            columns: [{ field: 'name', label: 'Participant type', widthPercent: 100, alignment: 'left', visible: true }],
            placement: { mode: 'flow', column: 0, columnSpan: 1 },
            fontSizePt: 9,
            headerBackground: '#EEEEEE',
            headerColor: '#000000',
            repeatHeader: true,
            rowBehavior: 'allow-split',
            emptyText: 'No participants recorded.',
          },
        ],
      },
    ],
  });
}

const render = (document = documentFixture(), over: Partial<Parameters<typeof renderReportDocumentHtml>[0]> = {}) =>
  renderReportDocumentHtml({
    document,
    data,
    year: 2026,
    quarter: 2,
    generatedOn: '2026-07-01',
    photos: [{ dataUri: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', caption: 'Mushroom beds' }],
    logoDataUri: null,
    fontCss: '',
    ...over,
  });

describe('v2 document rendering', () => {
  it('uses per-page sizes, margins, headers, footers, backgrounds, and borders', () => {
    const { html } = render();
    expect(html).toContain('@page hg_overview{size:215.9mm 279.4mm;margin:16mm 12mm 14mm 12mm;');
    expect(html).toContain('@page hg_issues{size:330.2mm 215.9mm;');
    expect(html).toContain('background:#FAFAFA;');
    expect(html).toContain('border:0.5mm solid #333333;');
    expect(html).toContain('@top-center{content:');
    expect(html).toContain('@bottom-right{content:');
  });

  it('renders only allowlisted data, escapes values, preserves row styling, and configures repeating table headers', () => {
    const { html } = render(undefined, {
      data: { ...data, yield: [{ category: 'Vegetables', crop: '<script>bad()</script>', kg: 1, pcs: 0 }] },
    });
    expect(html).toContain('Quarter 2 / 2026');
    expect(html).toContain('Farm: Kabutihan Farm');
    expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;');
    expect(html).toContain('Farmers');
    expect(html).toContain('display:table-header-group');
    expect(html).toContain('v2-row-keep');
    expect(html).not.toContain('report.yield');
    expect(html).not.toContain('<script>');
  });

  it('supports photo captions, safe image URLs, and explicit continuation styling', () => {
    const { html } = render();
    expect((html.match(/class="v2-page"/g) ?? []).length).toBe(3);
    expect(html).toContain('<figcaption>Mushroom beds</figcaption>');
    expect(html).toContain('data:image/jpeg;base64,/9j/4AAQSkZJRg==');
    expect(html).toContain('break-inside:avoid-page');
    const unsafe = render(undefined, { photos: [{ dataUri: 'https://example.test/photo.jpg', caption: '<img>' }] }).html;
    expect(unsafe).not.toContain('example.test');
    expect(unsafe).not.toContain('<figcaption><img>');
  });

  it('rejects invalid v2 documents before producing HTML', () => {
    const invalid = { ...documentFixture(), schemaVersion: 1 } as unknown as ReportTemplateDocument;
    expect(() => render(invalid)).toThrow(/saved report layout is invalid/i);
  });

  it('warns about a manually configured page with no rendered elements or visible regions', () => {
    const document = documentFixture();
    document.pages[1]!.elements = [];
    document.pages[1]!.header.enabled = false;
    document.pages[1]!.footer.enabled = false;
    const { warnings } = render(document);
    expect(warnings).toContainEqual({ elementId: 'issues', message: 'This page has no visible content.' });
  });
});
