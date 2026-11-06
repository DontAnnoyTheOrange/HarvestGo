import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  reportDataSchema,
  reportTemplateDocumentSchema,
  type ReportTemplateDocument,
  type ReportTemplatePreviewInput,
} from '@harvestgo/shared';
import type {
  GenerateReportInput, ListReportsQuery, ReportData, ReportList, ReportRecord, ReportUrl,
} from '@harvestgo/shared';
import type { AuthContext } from '../types.js';
import { throwDbError } from '../utils/dbErrors.js';
import { oneOf, profileEmbed } from '../utils/embeds.js';
import { HttpError, ServiceUnavailableError } from '../utils/errors.js';
import { embeddedFontCss } from '../reports/fonts.js';
import { pdfRenderer } from '../reports/pdfRenderer.js';
import { PDF_MARGIN, footerTemplate, pageDimensions, renderReportHtml } from '../reports/reportHtml.js';
import { isDocumentTemplate, renderReportDocumentHtml, type DocumentPhoto } from '../reports/documentRenderer.js';
import { DOCUMENTS_BUCKET } from './documentService.js';
import { getActiveTemplate } from './templateService.js';

export const REPORTS_BUCKET = 'harvestgo-reports'; // private
export const TEMPLATE_ASSETS_BUCKET = 'harvestgo-template-assets'; // private
const SIGNED_URL_SECONDS = 300;

const SELECT =
  'id, period_year, period_quarter, file_name, size_bytes, generated_by, generated_at, ' +
  'report_templates(name, version), profiles(full_name), report_documents(count)';

const tpl = z.object({ name: z.string(), version: z.number() });
const countRow = z.object({ count: z.number() });
const row = z.object({
  id: z.string(),
  period_year: z.number(),
  period_quarter: z.number(),
  file_name: z.string(),
  size_bytes: z.number().nullable(),
  generated_by: z.string(),
  generated_at: z.string(),
  report_templates: z.union([tpl, z.array(tpl)]).nullable(),
  profiles: z.union([profileEmbed, z.array(profileEmbed)]).nullable(),
  report_documents: z.array(countRow).nullish(),
});

function toRecord(raw: unknown): ReportRecord {
  const r = row.parse(raw);
  const t = oneOf(r.report_templates);
  return {
    id: r.id,
    periodYear: r.period_year,
    periodQuarter: r.period_quarter,
    templateName: t?.name ?? '',
    templateVersion: t?.version ?? 0,
    fileName: r.file_name,
    sizeBytes: r.size_bytes,
    photoCount: r.report_documents?.[0]?.count ?? 0,
    generatedBy: r.generated_by,
    generatedByName: oneOf(r.profiles)?.full_name ?? '',
    generatedAt: r.generated_at,
  };
}

/** Today's date in the Philippines, as YYYY-MM-DD. */
const manilaToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** The quarter's numbers, added up by the database as the logged-in person (security rules apply). */
export async function loadReportData(actor: AuthContext, year: number, quarter: number): Promise<ReportData> {
  const { data, error } = await actor.db.rpc('report_quarter_data', { p_year: year, p_quarter: quarter });
  if (error) {
    if (error.message.includes('INVALID_PERIOD')) throw new HttpError(400, 'VALIDATION_ERROR', 'Choose a valid year and quarter.');
    throwDbError(error, 'Report data');
  }
  const parsed = reportDataSchema.safeParse(data);
  if (!parsed.success) throw new ServiceUnavailableError(`report data had an unexpected shape: ${parsed.error.message}`);
  return parsed.data;
}

async function downloadAsBuffer(actor: AuthContext, bucket: string, path: string): Promise<Buffer> {
  const { data, error } = await actor.db.storage.from(bucket).download(path);
  if (error || !data) throw new ServiceUnavailableError(`could not read ${bucket}/${path}: ${error?.message ?? 'no data'}`);
  return Buffer.from(await data.arrayBuffer());
}

/** Fetches chosen photo bytes and captions in user-selected order. */
async function loadPhotos(actor: AuthContext, ids: string[], max: number): Promise<DocumentPhoto[]> {
  if (ids.length === 0) return [];
  const fail = (message: string) =>
    new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', { photoIds: [message] });
  if (ids.length > max) throw fail(`This template allows at most ${max} photos.`);

  const { data, error } = await actor.db.from('documents').select('id, storage_path, mime_type, kind, caption').in('id', ids);
  if (error) throwDbError(error, 'Photos');
  const byId = new Map((data ?? []).map((d) => [d.id as string, d]));
  const uris: DocumentPhoto[] = [];
  for (const id of ids) {
    const d = byId.get(id);
    if (!d) throw fail('One of the chosen photos was not found.');
    if (d.kind !== 'photo' || !['image/jpeg', 'image/png'].includes(d.mime_type as string)) throw fail('Only photos can be placed in the report.');
    const bytes = await downloadAsBuffer(actor, DOCUMENTS_BUCKET, d.storage_path as string);
    uris.push({
      dataUri: `data:${d.mime_type as string};base64,${bytes.toString('base64')}`,
      caption: typeof d.caption === 'string' ? d.caption : null,
    });
  }
  return uris;
}

async function loadLogo(actor: AuthContext, path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const bytes = await downloadAsBuffer(actor, TEMPLATE_ASSETS_BUCKET, path);
    const isPng = bytes.subarray(1, 4).toString() === 'PNG';
    return `data:image/${isPng ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`;
  } catch (err) {
    console.error('[reports] logo could not be loaded, continuing without it:', err instanceof Error ? err.message : err);
    return null; // a missing logo never blocks a report
  }
}

async function renderDocumentPdf(
  actor: AuthContext,
  document: ReportTemplateDocument,
  input: Pick<ReportTemplatePreviewInput, 'year' | 'quarter' | 'photoIds'>,
  data: ReportData,
): Promise<Buffer> {
  const photoElements = document.pages.flatMap((page) => page.elements)
    .filter((element) => element.type === 'photo_group' || element.type === 'photo');
  const maxPhotos = photoElements.reduce((max, element) => Math.max(
    max,
    element.type === 'photo_group' ? element.startIndex + element.maxPhotos : element.index + 1,
  ), 0);
  if (maxPhotos === 0 && input.photoIds.length > 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'This template does not include photo elements.', {
      photoIds: ['Remove selected photos or add a photo element to the template.'],
    });
  }
  const photos = maxPhotos > 0 ? await loadPhotos(actor, input.photoIds, maxPhotos) : [];
  const logoElement = document.pages.some((page) =>
    page.header.showLogo || page.footer.showLogo || page.elements.some((element) => element.type === 'logo'));
  const logoDataUri = logoElement ? await loadLogo(actor, document.logoPath) : null;
  const rendered = renderReportDocumentHtml({
    document, data, year: input.year, quarter: input.quarter, photos, logoDataUri,
    generatedOn: manilaToday(), fontCss: embeddedFontCss(), preparedByName: actor.fullName,
  });
  const firstPage = document.pages[0]!;
  const { width, height } = pageDimensions(firstPage.settings);
  const result = await pdfRenderer.renderWithDiagnostics({
    html: rendered.html,
    width,
    height,
    footerHtml: '<span></span>',
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    preferCssPageSize: true,
    displayHeaderFooter: false,
  });
  const warnings = [...rendered.warnings, ...result.warnings];
  if (warnings.length > 0) {
    throw new HttpError(422, 'TEMPLATE_LAYOUT_INVALID', 'The template layout has issues that must be fixed before a report can be generated.', {
      layout: warnings.map((warning) => `${warning.elementId}: ${warning.message}`),
    });
  }
  return result.pdf;
}

/** For the "review the numbers" screen. No PDF is made. */
export async function previewReport(actor: AuthContext, year: number, quarter: number): Promise<ReportData> {
  return loadReportData(actor, year, quarter);
}

/** Renders an unsaved v2 template for the editor; it does not save a template or report record. */
export async function previewTemplatePdf(actor: AuthContext, input: ReportTemplatePreviewInput): Promise<Buffer> {
  const parsed = reportTemplateDocumentSchema.safeParse(input.document);
  if (!parsed.success) {
    throw new HttpError(422, 'TEMPLATE_INVALID', 'The template settings are invalid.');
  }
  const data = await loadReportData(actor, input.year, input.quarter);
  return renderDocumentPdf(actor, parsed.data, input, data);
}

/**
 * Makes the report: gather the numbers and photos, fill the active template, create the PDF,
 * keep it in PRIVATE storage, and add it to the report history.
 */
export async function generateReport(actor: AuthContext, input: GenerateReportInput): Promise<ReportRecord> {
  const template = await getActiveTemplate(actor);
  if (!template) {
    throw new HttpError(409, 'NO_TEMPLATE', 'No report template is set up yet. Ask the General Manager to set up the official template.');
  }
  const data = await loadReportData(actor, input.year, input.quarter);
  const generatedOn = manilaToday();
  let pdf: Buffer;
  let generatedPhotoCount = 0;
  if (isDocumentTemplate(template.config)) {
    const document: ReportTemplateDocument = template.config;
    generatedPhotoCount = input.photoIds.length;
    pdf = await renderDocumentPdf(actor, document, input, data);
  } else {
    const config = template.config;
    const photos = config.photos.enabled ? await loadPhotos(actor, input.photoIds, config.photos.maxPhotos) : [];
    generatedPhotoCount = photos.length;
    const logoDataUri = await loadLogo(actor, config.header.logoPath);
    const html = renderReportHtml({
      config, data, year: input.year, quarter: input.quarter, photos: photos.map((photo) => photo.dataUri), logoDataUri,
      generatedOn, fontCss: embeddedFontCss(),
    });
    pdf = await pdfRenderer.render({
      html, ...pageDimensions(config.page), footerHtml: footerTemplate(config), margin: { ...PDF_MARGIN },
    });
  }

  const fileName = `ATI-Quarterly-Accomplishment-Report-${input.year}-Q${input.quarter}.pdf`;
  const path = `${input.year}/Q${input.quarter}/${randomUUID()}.pdf`;
  const up = await actor.db.storage.from(REPORTS_BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: false });
  if (up.error) {
    console.error('[reports] storage upload failed:', up.error.message);
    throw new ServiceUnavailableError(`report upload failed: ${up.error.message}`);
  }

  const { data: saved, error } = await actor.db
    .from('reports')
    .insert({
      period_year: input.year,
      period_quarter: input.quarter,
      template_id: template.id,
      file_name: fileName,
      storage_path: path,
      size_bytes: pdf.length,
      generated_by: actor.userId, // always the real logged-in person
    })
    .select(SELECT)
    .single();
  if (error) {
    await actor.db.storage.from(REPORTS_BUCKET).remove([path]).catch(() => undefined); // no orphan file
    throwDbError(error, 'Report');
  }
  const record = toRecord(saved);

  // Remember which photos went in. The PDF is already valid, so a problem here is logged, not fatal.
  let linked = generatedPhotoCount;
  if (generatedPhotoCount > 0) {
    const links = input.photoIds.map((id, i) => ({ report_id: record.id, document_id: id, sort_order: i }));
    const link = await actor.db.from('report_documents').insert(links);
    if (link.error) {
      console.error('[reports] could not record which photos were used:', link.error.message);
      linked = 0;
    }
  }
  return { ...record, photoCount: linked };
}

export async function listReports(actor: AuthContext, f: ListReportsQuery): Promise<ReportList> {
  const start = (f.page - 1) * f.pageSize;
  const build = (q: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    let r = q;
    if (f.year) r = r.eq('period_year', f.year);
    if (f.quarter) r = r.eq('period_quarter', f.quarter);
    return r;
  };
  const { data, count, error } = await build(actor.db.from('reports').select(SELECT, { count: 'exact' }))
    .order('generated_at', { ascending: false })
    .range(start, start + f.pageSize - 1);
  if (error) {
    if (error.code === 'PGRST103') {
      const head = await build(actor.db.from('reports').select('id', { count: 'exact', head: true }));
      return { records: [], total: head.count ?? 0, page: f.page, pageSize: f.pageSize };
    }
    throwDbError(error, 'Reports');
  }
  return { records: ((data ?? []) as unknown[]).map(toRecord), total: count ?? 0, page: f.page, pageSize: f.pageSize };
}

/** A link that works for 5 minutes and saves the file with a friendly name. */
export async function createReportUrl(actor: AuthContext, id: string): Promise<ReportUrl> {
  const found = await actor.db.from('reports').select('storage_path, file_name').eq('id', id).maybeSingle();
  if (found.error) throwDbError(found.error, 'Report');
  if (!found.data) throw new HttpError(404, 'NOT_FOUND', 'Report not found.');
  const signed = await actor.db.storage
    .from(REPORTS_BUCKET)
    .createSignedUrl(found.data.storage_path as string, SIGNED_URL_SECONDS, { download: found.data.file_name as string });
  if (signed.error || !signed.data) throw new ServiceUnavailableError(`signed url failed: ${signed.error?.message ?? 'no data'}`);
  return { url: signed.data.signedUrl, expiresInSeconds: SIGNED_URL_SECONDS };
}

/** Removes the history entry first, then the stored file. (General Manager only.) */
export async function deleteReport(actor: AuthContext, id: string): Promise<void> {
  const found = await actor.db.from('reports').select('id, storage_path').eq('id', id).maybeSingle();
  if (found.error) throwDbError(found.error, 'Report');
  if (!found.data) throw new HttpError(404, 'NOT_FOUND', 'Report not found.');

  const { data, error } = await actor.db.from('reports').delete().eq('id', id).select('id');
  if (error) throwDbError(error, 'Report');
  if (!data || data.length === 0) throw new HttpError(404, 'NOT_FOUND', 'Report not found.');

  const gone = await actor.db.storage.from(REPORTS_BUCKET).remove([found.data.storage_path as string]);
  if (gone.error) console.error('[reports] file could not be removed from storage (orphan):', found.data.storage_path, gone.error.message);
}