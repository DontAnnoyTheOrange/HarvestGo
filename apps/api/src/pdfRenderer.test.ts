import { describe, expect, it } from 'vitest';
import { OFFICIAL_TEMPLATE_CONFIG, reportTemplateDocumentSchema, type ReportData } from '@harvestgo/shared';
import { embeddedFontCss } from './reports/fonts.js';
import { PdfRenderer } from './reports/pdfRenderer.js';
import { PDF_MARGIN, footerTemplate, pageDimensions, renderReportHtml } from './reports/reportHtml.js';
import { renderReportDocumentHtml } from './reports/documentRenderer.js';

const data: ReportData = {
  from: '2025-04-01', to: '2025-06-30', categories: ['Rice', 'Vegetables', 'Fruits', 'Poultry', 'Livestock', 'Others'],
  services: [{ serviceType: 'training', activities: 1, titles: ['Mushroom Cultivation Seminar'], male: 17, female: 44 }],
  participantTypes: ['Farmers'], yield: [{ category: 'Vegetables', crop: 'Mushroom', kg: 30.986, pcs: 0 }],
  cost: [], sales: [], income: [], issues: [],
};

// Opens a real Chrome, so it is OFF by default. To run it:  set RUN_PDF_TESTS=1  (Windows PowerShell: $env:RUN_PDF_TESTS=1)
describe.skipIf(!process.env.RUN_PDF_TESTS)('real PDF (needs the Chrome that Puppeteer downloads)', () => {
  it('makes the five-page long-bond landscape report', async () => {
    const html = renderReportHtml({ config: OFFICIAL_TEMPLATE_CONFIG, data, year: 2025, quarter: 2, photos: [], logoDataUri: null, generatedOn: '2025-07-01', fontCss: embeddedFontCss() });
    const renderer = new PdfRenderer();
    try {
      const pdf = await renderer.render({ html, ...pageDimensions(OFFICIAL_TEMPLATE_CONFIG.page), footerHtml: footerTemplate(OFFICIAL_TEMPLATE_CONFIG), margin: { ...PDF_MARGIN } });
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(5);
      expect(pdf.toString('latin1')).toMatch(/\/MediaBox\s*\[\s*0\s+0\s+936\s+612\s*\]/); // 13 x 8.5 inches
    } finally {
      await renderer.close();
    }
  }, 60_000);

  it('makes reports one after another without crashing, and stays safe with hostile content', async () => {
    const hostile = '<html><body><script>document.title="x"</script><img src="http://127.0.0.1:9/never.png"><link rel="stylesheet" href="file:///etc/passwd"><p>still works</p></body></html>';
    const renderer = new PdfRenderer();
    try {
      const job = { html: hostile, width: '8.5in', height: '11in', footerHtml: '<span></span>', margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' } };
      const results = await Promise.all([renderer.render(job), renderer.render(job)]);
      for (const pdf of results) expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    } finally {
      await renderer.close();
    }
  }, 60_000);

  it('flows long tables and photo groups across mixed-size pages with page headers and footers', async () => {
    const longData: ReportData = {
      ...data,
      issues: Array.from({ length: 70 }, (_, index) => ({
        date: '2025-06-01',
        problem: `Issue ${index + 1}: ${'irrigation inspection detail '.repeat(3)}`,
        actionTaken: 'The staff repaired and checked the system.',
        recommendation: 'Inspect the affected section again next week.',
      })),
    };
    const doc = reportTemplateDocumentSchema.parse({
      schemaVersion: 2,
      name: 'Pagination test',
      farm: { name: 'Kabutihan Farm', shortName: 'Kabutihan' },
      logoPath: null,
      pages: [
        {
          id: 'portrait',
          name: 'Long issues',
          settings: { size: 'letter', orientation: 'portrait', margins: { top: 16, right: 12, bottom: 14, left: 12 } },
          layout: { mode: 'flow', columns: 1, gapMm: 0 },
          backgroundColor: '#FFFFFF',
          border: { enabled: false, color: '#000000', widthMm: 0 },
          header: { enabled: true, lines: ['Issue register'], alignment: 'center', showLogo: false, showPageNumber: false },
          footer: { enabled: true, lines: ['Pagination test'], alignment: 'right', showLogo: false, showPageNumber: true },
          elements: [
            { id: 'heading', type: 'section_heading', text: 'Recorded issues', placement: { mode: 'flow', column: 0, columnSpan: 1 }, fontSizePt: 12, bold: true },
            {
              id: 'issues',
              type: 'table',
              binding: 'report.issues',
              columns: [
                { field: 'date', label: 'Date', widthPercent: 14, alignment: 'left', visible: true },
                { field: 'problem', label: 'Problem', widthPercent: 36, alignment: 'left', visible: true },
                { field: 'actionTaken', label: 'Action', widthPercent: 25, alignment: 'left', visible: true },
                { field: 'recommendation', label: 'Recommendation', widthPercent: 25, alignment: 'left', visible: true },
              ],
              placement: { mode: 'flow', column: 0, columnSpan: 1 },
              fontSizePt: 9,
              headerBackground: '#EEEEEE',
              headerColor: '#000000',
              repeatHeader: true,
              rowBehavior: 'keep-together',
              emptyText: 'No issues recorded.',
            },
          ],
        },
        {
          id: 'landscape',
          name: 'Photo pages',
          settings: { size: 'long', orientation: 'landscape', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
          layout: { mode: 'flow', columns: 1, gapMm: 0 },
          backgroundColor: null,
          border: { enabled: false, color: '#000000', widthMm: 0 },
          header: { enabled: true, lines: ['Photo documentation'], alignment: 'left', showLogo: false, showPageNumber: false },
          footer: { enabled: true, lines: ['Farm report'], alignment: 'center', showLogo: false, showPageNumber: true },
          elements: [
            {
              id: 'photos',
              type: 'photo_group',
              binding: 'report.photos',
              startIndex: 0,
              columns: 2,
              imageHeightMm: 100,
              fit: 'contain',
              alignment: 'center',
              showCaptions: true,
              maxPhotos: 12,
              continueAcrossPages: true,
              placement: { mode: 'flow', column: 0, columnSpan: 1 },
            },
          ],
        },
      ],
    });
    const photos = Array.from({ length: 12 }, (_, index) => ({
      dataUri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV1sAAAAASUVORK5CYII=',
      caption: `Photo ${index + 1}`,
    }));
    const rendered = renderReportDocumentHtml({
      document: doc,
      data: longData,
      year: 2025,
      quarter: 2,
      generatedOn: '2025-07-01',
      photos,
      logoDataUri: null,
      fontCss: embeddedFontCss(),
    });
    expect(rendered.html).toContain('display:table-header-group');
    expect(rendered.html).toContain('counter(page)');

    const renderer = new PdfRenderer();
    try {
      const pdf = await renderer.render({
        html: rendered.html,
        width: '8.5in',
        height: '11in',
        footerHtml: '<span></span>',
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
        preferCssPageSize: true,
        displayHeaderFooter: false,
      });
      const pdfText = pdf.toString('latin1');
      expect((pdfText.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeGreaterThanOrEqual(8);
      expect(pdfText).toContain('/MediaBox [0 0 612 792]');
      expect(pdfText).toContain('/MediaBox [0 0 936 612]');
    } finally {
      await renderer.close();
    }
  }, 60_000);

  it('reports positioned content overflow rather than clipping it silently', async () => {
    const doc = reportTemplateDocumentSchema.parse({
      schemaVersion: 2,
      name: 'Overflow test',
      farm: { name: 'Kabutihan Farm', shortName: 'Kabutihan' },
      logoPath: null,
      pages: [{
        id: 'page',
        name: 'Page',
        settings: { size: 'letter', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
        layout: { mode: 'hybrid', columns: 1, gapMm: 0 },
        backgroundColor: null,
        border: { enabled: false, color: '#000000', widthMm: 0 },
        header: { enabled: false, lines: [], alignment: 'left', showLogo: false, showPageNumber: false },
        footer: { enabled: false, lines: [], alignment: 'left', showLogo: false, showPageNumber: false },
        elements: [{
          id: 'tiny-box',
          type: 'paragraph',
          text: 'This positioned paragraph is deliberately much too large for its box. '.repeat(8),
          placement: { mode: 'positioned', x: 5, y: 5, width: 15, height: 2 },
          fontSizePt: 10,
        }],
      }],
    });
    const rendered = renderReportDocumentHtml({
      document: doc,
      data,
      year: 2025,
      quarter: 2,
      generatedOn: '2025-07-01',
      photos: [],
      logoDataUri: null,
      fontCss: '',
    });
    const renderer = new PdfRenderer();
    try {
      const result = await renderer.renderWithDiagnostics({
        html: rendered.html,
        width: '8.5in',
        height: '11in',
        footerHtml: '<span></span>',
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
        preferCssPageSize: true,
        displayHeaderFooter: false,
      });
      expect(result.pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(result.warnings).toEqual([expect.objectContaining({ elementId: 'tiny-box' })]);
    } finally {
      await renderer.close();
    }
  }, 60_000);
});