import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OFFICIAL_TEMPLATE_CONFIG, OFFICIAL_TEMPLATE_NAME, reportTemplateDocumentSchema } from '@harvestgo/shared';

const renderer = vi.hoisted(() => ({ render: vi.fn(), renderWithDiagnostics: vi.fn() }));
vi.mock('./reports/pdfRenderer.js', () => ({ pdfRenderer: renderer }));

import { createReportUrl, deleteReport, generateReport, listReports, previewReport, previewTemplatePdf } from './services/reportService.js';
import {
  deleteTemplateDraft, getTemplateDraft, installOfficialTemplate, saveTemplateConfig, saveTemplateDraft,
} from './services/templateService.js';

/** A pretend database call: any chain of .select().eq()... finally resolves to `result`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chain(result: unknown): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = new Proxy({}, { get: (_t, prop) => (prop === 'then' ? (res: (v: unknown) => void) => res(result) : () => c) });
  return c;
}
const reportData = {
  from: '2026-04-01', to: '2026-06-30', categories: ['Vegetables'], services: [], participantTypes: [],
  yield: [], cost: [], sales: [], income: [], issues: [],
};
const templateRow = { id: 't1', name: OFFICIAL_TEMPLATE_NAME, version: 1, is_active: true, config: OFFICIAL_TEMPLATE_CONFIG, created_at: '2026-10-01T00:00:00Z' };
const savedRow = {
  id: 'r1', period_year: 2026, period_quarter: 2, file_name: 'ATI-Quarterly-Accomplishment-Report-2026-Q2.pdf', size_bytes: 4,
  generated_by: 'u1', generated_at: '2026-07-01T00:00:00Z', report_templates: { name: OFFICIAL_TEMPLATE_NAME, version: 1 },
  profiles: { full_name: 'Staff Bee' }, report_documents: [{ count: 0 }],
};
const photoId = '3f2a4d3e-6a52-4b52-9a4e-1c2d3e4f5a6b';
const photoId2 = '4f2a4d3e-6a52-4b52-9a4e-1c2d3e4f5a6b';

function fakeDb(answers: unknown[], opts: { rpc?: unknown; upload?: unknown; download?: unknown; signed?: unknown; remove?: unknown } = {}) {
  const from = vi.fn().mockReturnValue(chain({ data: null, error: null }));
  for (const a of answers) from.mockReturnValueOnce(chain(a));
  const upload = vi.fn().mockResolvedValue(opts.upload ?? { data: {}, error: null });
  const remove = vi.fn().mockResolvedValue(opts.remove ?? { data: [], error: null });
  const download = vi.fn().mockResolvedValue(opts.download ?? { data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }, error: null });
  const createSignedUrl = vi.fn().mockResolvedValue(opts.signed ?? { data: { signedUrl: 'https://files.example/signed' }, error: null });
  const bucket = vi.fn().mockReturnValue({ upload, remove, download, createSignedUrl });
  const rpc = vi.fn().mockResolvedValue(opts.rpc ?? { data: reportData, error: null });
  return { from, rpc, storage: { from: bucket }, upload, remove, download, createSignedUrl, bucket };
}
const actor = (role: string, userId: string, db: unknown) => ({ userId, role, db }) as never;
const input = { year: 2026, quarter: 2, photoIds: [] as string[] };

function v2Document(name = 'Custom report') {
  return reportTemplateDocumentSchema.parse({
    schemaVersion: 2,
    name,
    farm: { name: 'Kabutihan Farm', shortName: 'Kabutihan' },
    logoPath: null,
    pages: [{
      id: 'preview-page',
      name: 'Preview page',
      settings: { size: 'letter', orientation: 'portrait', margins: { top: 10, right: 10, bottom: 10, left: 10 } },
      layout: { mode: 'flow', columns: 1, gapMm: 0 },
      backgroundColor: null,
      border: { enabled: false, color: '#000000', widthMm: 0 },
      header: { enabled: false, lines: [], alignment: 'left', showLogo: false, showPageNumber: false },
      footer: { enabled: false, lines: [], alignment: 'left', showLogo: false, showPageNumber: false },
      elements: [{
        id: 'title',
        type: 'report_title',
        text: 'Quarterly report',
        placement: { mode: 'flow', column: 0, columnSpan: 1 },
        fontSizePt: 18,
      }],
    }],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  renderer.render.mockResolvedValue(Buffer.from('%PDF'));
  renderer.renderWithDiagnostics.mockResolvedValue({ pdf: Buffer.from('%PDFv2'), warnings: [] });
});

describe('generateReport', () => {
  it('fills the template, makes the PDF, stores it PRIVATELY and records it in the history', async () => {
    const db = fakeDb([{ data: templateRow, error: null }, { data: savedRow, error: null }]);
    const rec = await generateReport(actor('administrative_staff', 'u1', db), input);

    expect(db.rpc).toHaveBeenCalledWith('report_quarter_data', { p_year: 2026, p_quarter: 2 });
    const job = renderer.render.mock.calls[0]![0];
    expect(job.width).toBe('13in');
    expect(job.height).toBe('8.5in');
    expect(job.html).toContain('KABUTIHAN INCORPORATED (KABUTIHAN FARM)');
    expect(job.footerHtml).toContain('ATI-QF/PAD-119');

    expect(db.bucket).toHaveBeenCalledWith('harvestgo-reports');
    const [path, body, options] = db.upload.mock.calls[0]!;
    expect(path).toMatch(/^2026\/Q2\/[0-9a-f-]{36}\.pdf$/); // random name, never the person's input
    expect((body as Buffer).toString()).toBe('%PDF');
    expect(options).toEqual({ contentType: 'application/pdf', upsert: false });

    expect(rec).toMatchObject({ periodYear: 2026, periodQuarter: 2, fileName: 'ATI-Quarterly-Accomplishment-Report-2026-Q2.pdf', generatedByName: 'Staff Bee', photoCount: 0, templateVersion: 1 });
  });

  describe('previewTemplatePdf', () => {
    it('renders the unsaved v2 document without uploading a PDF or inserting report history', async () => {
      const db = fakeDb([]);
      const document = v2Document();
      const pdf = await previewTemplatePdf(actor('general_manager', 'gm', db), {
        document, year: 2026, quarter: 2, photoIds: [],
      });

      expect(pdf).toEqual(Buffer.from('%PDFv2'));
      expect(db.rpc).toHaveBeenCalledWith('report_quarter_data', { p_year: 2026, p_quarter: 2 });
      expect(db.from).not.toHaveBeenCalled();
      expect(db.upload).not.toHaveBeenCalled();
      expect(renderer.renderWithDiagnostics).toHaveBeenCalledTimes(1);
      expect(renderer.renderWithDiagnostics.mock.calls[0]![0].html).toContain('Quarterly report');
    });

    it('rejects invalid layout warnings instead of showing an apparently valid preview', async () => {
      renderer.renderWithDiagnostics.mockResolvedValueOnce({
        pdf: Buffer.from('%PDFv2'),
        warnings: [{ elementId: 'title', message: 'Element extends beyond the page.' }],
      });
      await expect(previewTemplatePdf(actor('general_manager', 'gm', fakeDb([])), {
        document: v2Document(), year: 2026, quarter: 2, photoIds: [],
      })).rejects.toMatchObject({ status: 422, code: 'TEMPLATE_LAYOUT_INVALID' });
    });
  });

  describe('saveTemplateConfig', () => {
    it('saves a named v2 template version without changing the existing versioning RPC', async () => {
      const document = v2Document('My flexible report');
      const db = fakeDb([{
        data: { ...templateRow, name: document.name, version: 3, config: document },
        error: null,
      }]);

      const active = await saveTemplateConfig(actor('general_manager', 'gm', db), document);

      expect(db.rpc).toHaveBeenCalledWith('install_report_template', {
        p_name: 'My flexible report',
        p_config: document,
      });
      expect(active).toMatchObject({ name: 'My flexible report', version: 3, config: document, isActive: true });
    });
  });

  describe('report template drafts', () => {
    it('loads, saves, and discards a validated v2 draft', async () => {
      const document = v2Document('Draft report');
      const db = fakeDb([
        { data: { config: document, updated_at: '2026-11-06T08:00:00Z' }, error: null },
        { data: { config: document, updated_at: '2026-11-06T08:01:00Z' }, error: null },
      ]);

      await expect(getTemplateDraft(actor('general_manager', 'gm', db))).resolves.toEqual({
        document,
        updatedAt: '2026-11-06T08:00:00Z',
      });
      await expect(saveTemplateDraft(actor('general_manager', 'gm', db), document)).resolves.toEqual({
        document,
        updatedAt: '2026-11-06T08:01:00Z',
      });
      expect(db.from).toHaveBeenNthCalledWith(2, 'report_template_drafts');
      await expect(deleteTemplateDraft(actor('general_manager', 'gm', db))).resolves.toBeUndefined();
      expect(db.from).toHaveBeenNthCalledWith(3, 'report_template_drafts');
    });
  });

  it('uses the v2 document renderer only for schema-version-2 templates', async () => {
    const document = reportTemplateDocumentSchema.parse({
      schemaVersion: 2,
      name: 'Custom report',
      farm: { name: 'Kabutihan Farm', shortName: 'Kabutihan' },
      logoPath: 'custom-logo.png',
      pages: [{
        id: 'page-one',
        name: 'Page one',
        settings: { size: 'a4', orientation: 'portrait', margins: { top: 10, right: 12, bottom: 10, left: 12 } },
        layout: { mode: 'flow', columns: 1, gapMm: 0 },
        backgroundColor: null,
        border: { enabled: false, color: '#000000', widthMm: 0 },
        header: { enabled: false, lines: [], alignment: 'left', showLogo: false, showPageNumber: false },
        footer: { enabled: true, lines: [], alignment: 'left', showLogo: true, showPageNumber: false },
        elements: [{
          id: 'title',
          type: 'report_title',
          text: 'Custom quarterly report',
          placement: { mode: 'flow', column: 0, columnSpan: 1 },
          fontSizePt: 18,
          bold: true,
          alignment: 'center',
        }],
      }],
    });
    const db = fakeDb([
      { data: { ...templateRow, name: 'Custom report', config: document }, error: null },
      { data: savedRow, error: null },
    ]);

    await generateReport(actor('administrative_staff', 'u1', db), input);

    expect(renderer.renderWithDiagnostics).toHaveBeenCalledTimes(1);
    expect(renderer.render).not.toHaveBeenCalled();
    expect(renderer.renderWithDiagnostics.mock.calls[0]![0]).toMatchObject({
      width: '210mm',
      height: '297mm',
      preferCssPageSize: true,
      displayHeaderFooter: false,
    });
    expect(renderer.renderWithDiagnostics.mock.calls[0]![0].html).toContain('Custom quarterly report');
    expect(db.bucket).toHaveBeenCalledWith('harvestgo-template-assets');
    expect(db.download).toHaveBeenCalledWith('custom-logo.png');
    expect(renderer.renderWithDiagnostics.mock.calls[0]![0].html).toContain('data:image/jpeg;base64,AQID');
    expect(db.upload.mock.calls[0]?.[1]).toEqual(Buffer.from('%PDFv2'));
  });

  it('puts the chosen photos into the report, in the chosen order, and remembers them', async () => {
    const db = fakeDb([
      { data: templateRow, error: null },
      { data: [{ id: photoId, storage_path: 'a.jpg', mime_type: 'image/jpeg', kind: 'photo' }, { id: photoId2, storage_path: 'b.jpg', mime_type: 'image/jpeg', kind: 'photo' }], error: null },
      { data: savedRow, error: null },
      { data: null, error: null },
    ]);
    const rec = await generateReport(actor('administrative_staff', 'u1', db), { ...input, photoIds: [photoId2, photoId] });
    expect(db.download.mock.calls.map((c) => c[0])).toEqual(['b.jpg', 'a.jpg']); // the order the person chose
    expect(db.bucket).toHaveBeenCalledWith('harvestgo-documents');
    expect(renderer.render.mock.calls[0]![0].html).toContain('data:image/jpeg;base64,AQID');
    expect(rec.photoCount).toBe(2);
  });

  it('says clearly when no template is set up yet', async () => {
    const db = fakeDb([{ data: null, error: null }]);
    await expect(generateReport(actor('administrative_staff', 'u1', db), input)).rejects.toMatchObject({ status: 409, code: 'NO_TEMPLATE' });
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('refuses a saved template that is no longer valid, without making anything', async () => {
    const db = fakeDb([{ data: { ...templateRow, config: { broken: true } }, error: null }]);
    await expect(generateReport(actor('administrative_staff', 'u1', db), input)).rejects.toMatchObject({ status: 422, code: 'TEMPLATE_INVALID' });
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('refuses more photos than the template allows', async () => {
    const seven = Array.from({ length: 7 }, (_, i) => `3f2a4d3e-6a52-4b52-9a4e-1c2d3e4f5a${String(i).padStart(2, '0')}`);
    const db = fakeDb([{ data: templateRow, error: null }]);
    await expect(generateReport(actor('administrative_staff', 'u1', db), { ...input, photoIds: seven })).rejects.toMatchObject({ status: 400, details: { photoIds: expect.any(Array) } });
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('refuses a photo that does not exist, or a file that is not a photo', async () => {
    const missing = fakeDb([{ data: templateRow, error: null }, { data: [], error: null }]);
    await expect(generateReport(actor('administrative_staff', 'u1', missing), { ...input, photoIds: [photoId] })).rejects.toMatchObject({ status: 400 });
    const pdfDoc = fakeDb([{ data: templateRow, error: null }, { data: [{ id: photoId, storage_path: 'a.pdf', mime_type: 'application/pdf', kind: 'supporting_document' }], error: null }]);
    await expect(generateReport(actor('administrative_staff', 'u1', pdfDoc), { ...input, photoIds: [photoId] })).rejects.toMatchObject({ status: 400 });
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('reports a storage problem as "temporarily unavailable" and records nothing', async () => {
    const db = fakeDb([{ data: templateRow, error: null }], { upload: { data: null, error: { message: 'bucket missing' } } });
    await expect(generateReport(actor('administrative_staff', 'u1', db), input)).rejects.toMatchObject({ status: 503 });
    expect(db.from).toHaveBeenCalledTimes(1); // only the template lookup, no history row
  });

  it('removes the stored PDF again if the history row cannot be saved (no orphans)', async () => {
    const db = fakeDb([{ data: templateRow, error: null }, { data: null, error: { code: '42501', message: 'rls' } }]);
    await expect(generateReport(actor('administrative_staff', 'u1', db), input)).rejects.toMatchObject({ status: 403 });
    expect(db.remove).toHaveBeenCalledWith([db.upload.mock.calls[0]![0]]);
  });

  it('still succeeds if only the "which photos were used" note fails', async () => {
    const db = fakeDb([
      { data: templateRow, error: null },
      { data: [{ id: photoId, storage_path: 'a.jpg', mime_type: 'image/jpeg', kind: 'photo' }], error: null },
      { data: savedRow, error: null },
      { data: null, error: { code: 'XX', message: 'boom' } },
    ]);
    const rec = await generateReport(actor('administrative_staff', 'u1', db), { ...input, photoIds: [photoId] });
    expect(rec.photoCount).toBe(0);
  });

  it('carries on without the logo if the logo file cannot be read', async () => {
    const cfg = structuredClone(OFFICIAL_TEMPLATE_CONFIG);
    cfg.header.logoPath = 'logo.png';
    const db = fakeDb([{ data: { ...templateRow, config: cfg }, error: null }, { data: savedRow, error: null }], { download: { data: null, error: { message: 'missing' } } });
    await expect(generateReport(actor('general_manager', 'gm', db), input)).resolves.toBeDefined();
    expect(renderer.render.mock.calls[0]![0].html).not.toContain('<img src="data:image');
  });
});

describe('numbers, history, download, delete', () => {
  it('previews the numbers; a bad period is a clear 400; a database fault is 503', async () => {
    expect((await previewReport(actor('administrative_staff', 'u1', fakeDb([])), 2026, 2)).from).toBe('2026-04-01');
    const bad = fakeDb([], { rpc: { data: null, error: { code: 'P0001', message: 'INVALID_PERIOD' } } });
    await expect(previewReport(actor('administrative_staff', 'u1', bad), 2026, 9)).rejects.toMatchObject({ status: 400 });
    const down = fakeDb([], { rpc: { data: null, error: { code: 'PGRST202', message: 'function not found' } } });
    await expect(previewReport(actor('administrative_staff', 'u1', down), 2026, 2)).rejects.toMatchObject({ status: 503 });
  });

  it('lists reports with their template version and photo count', async () => {
    const db = fakeDb([{ data: [{ ...savedRow, report_documents: [{ count: 3 }] }], count: 1, error: null }]);
    const out = await listReports(actor('administrative_staff', 'u1', db), { page: 1, pageSize: 20 });
    expect(out.total).toBe(1);
    expect(out.records[0]).toMatchObject({ photoCount: 3, templateName: OFFICIAL_TEMPLATE_NAME, generatedByName: 'Staff Bee' });
  });

  it('makes a 5-minute download link that saves under a friendly file name', async () => {
    const db = fakeDb([{ data: { storage_path: '2026/Q2/x.pdf', file_name: 'Report.pdf' }, error: null }]);
    const out = await createReportUrl(actor('administrative_staff', 'u1', db), 'r1');
    expect(db.createSignedUrl).toHaveBeenCalledWith('2026/Q2/x.pdf', 300, { download: 'Report.pdf' });
    expect(out.expiresInSeconds).toBe(300);
    await expect(createReportUrl(actor('administrative_staff', 'u1', fakeDb([{ data: null, error: null }])), 'r1')).rejects.toMatchObject({ status: 404 });
  });

  it('deletes the history entry, then the file; 404 leaves the file alone', async () => {
    const ok = fakeDb([{ data: { id: 'r1', storage_path: 'p.pdf' }, error: null }, { data: [{ id: 'r1' }], error: null }]);
    await expect(deleteReport(actor('general_manager', 'gm', ok), 'r1')).resolves.toBeUndefined();
    expect(ok.remove).toHaveBeenCalledWith(['p.pdf']);
    const none = fakeDb([{ data: null, error: null }]);
    await expect(deleteReport(actor('general_manager', 'gm', none), 'r1')).rejects.toMatchObject({ status: 404 });
    expect(none.remove).not.toHaveBeenCalled();
  });
});

describe('setting up the official template', () => {
  it('saves the official layout through the all-or-nothing function and returns the active template', async () => {
    const db = fakeDb([{ data: templateRow, error: null }]);
    const rec = await installOfficialTemplate(actor('general_manager', 'gm', db));
    expect(db.rpc).toHaveBeenCalledWith('install_report_template', { p_name: OFFICIAL_TEMPLATE_NAME, p_config: OFFICIAL_TEMPLATE_CONFIG });
    expect(rec).toMatchObject({ name: OFFICIAL_TEMPLATE_NAME, isActive: true });
  });
  it('turns the database "not allowed" into a clear 403', async () => {
    const db = fakeDb([], { rpc: { data: null, error: { code: '42501', message: 'rls' } } });
    await expect(installOfficialTemplate(actor('administrative_staff', 'u1', db))).rejects.toMatchObject({ status: 403 });
  });
});