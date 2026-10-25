import { describe, expect, it } from 'vitest';
import { OFFICIAL_TEMPLATE_CONFIG, type ReportData } from '@harvestgo/shared';
import { embeddedFontCss } from './reports/fonts.js';
import { PdfRenderer } from './reports/pdfRenderer.js';
import { PDF_MARGIN, footerTemplate, pageDimensions, renderReportHtml } from './reports/reportHtml.js';

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
});