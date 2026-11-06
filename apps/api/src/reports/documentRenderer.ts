import {
  reportTemplateDocumentSchema,
  type ReportData,
  type ReportTemplateDocument,
  type ReportTemplateVersion,
} from '@harvestgo/shared';
import { HttpError } from '../utils/errors.js';
import { esc, longDate, peso } from './reportHtml.js';

export interface DocumentPhoto {
  dataUri: string;
  caption: string | null;
}

export interface DocumentRenderInput {
  document: ReportTemplateDocument;
  data: ReportData;
  year: number;
  quarter: number;
  generatedOn: string;
  photos: DocumentPhoto[];
  logoDataUri: string | null;
  fontCss: string;
  preparedByName?: string;
}

export interface DocumentLayoutWarning {
  elementId: string;
  message: string;
}

export interface DocumentHtmlResult {
  html: string;
  warnings: DocumentLayoutWarning[];
}

const SAFE_IMAGE = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;
const SERVICE_LABELS: Record<ReportData['services'][number]['serviceType'], string> = {
  training: 'Training',
  technical_assistance: 'Technical Assistance',
  iec_distribution: 'IEC Distribution',
  others: 'Others',
};

function cssString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r\n|\r|\n/g, '\\A ')}"`;
}

function cssPageSize(size: 'long' | 'a4' | 'letter', orientation: 'landscape' | 'portrait'): string {
  const dimensions = size === 'a4' ? [297, 210] : size === 'letter' ? [279.4, 215.9] : [330.2, 215.9];
  const [width, height] = orientation === 'landscape' ? dimensions : [dimensions[1], dimensions[0]];
  return `${width}mm ${height}mm`;
}

function pageName(id: string): string {
  return `hg_${id}`;
}

function inlineDataImage(uri: string | null): string | null {
  return uri && SAFE_IMAGE.test(uri) ? uri : null;
}

function regionContent(
  lines: string[],
  showLogo: boolean,
  showPageNumber: boolean,
  logo: string | null,
): string {
  const tokens: string[] = [];
  if (showLogo && logo) tokens.push(`url(${cssString(logo)})`);
  for (const line of lines.filter(Boolean)) {
    if (tokens.length > 0) tokens.push(cssString('\n'));
    tokens.push(cssString(line));
  }
  if (showPageNumber) {
    if (tokens.length) tokens.push(cssString('  '));
    tokens.push('counter(page)', cssString(' / '), 'counter(pages)');
  }
  if (tokens.length === 0) return '""';
  return tokens.join(' ');
}

function pageCss(document: ReportTemplateDocument, logo: string | null): string {
  return document.pages.map((page) => {
    const { margins } = page.settings;
    const regionSlot = (alignment: 'left' | 'center' | 'right') => alignment === 'left' ? 'left'
      : alignment === 'right' ? 'right' : 'center';
    const header = page.header.enabled
      ? `@top-${regionSlot(page.header.alignment)}{content:${regionContent(page.header.lines, page.header.showLogo, page.header.showPageNumber, logo)};white-space:pre-line;font-size:9pt;}`
      : '';
    const footer = page.footer.enabled
      ? `@bottom-${regionSlot(page.footer.alignment)}{content:${regionContent(page.footer.lines, page.footer.showLogo, page.footer.showPageNumber, logo)};white-space:pre-line;font-size:8pt;}`
      : '';
    return `@page ${pageName(page.id)}{size:${cssPageSize(page.settings.size, page.settings.orientation)};margin:${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;${header}${footer}}`;
  }).join('\n');
}

function textStyle(element: {
  fontFamily: 'serif' | 'sans-serif';
  fontSizePt: number;
  bold: boolean;
  alignment: 'left' | 'center' | 'right';
  color: string;
}): string {
  return `font-family:${element.fontFamily};font-size:${element.fontSizePt}pt;font-weight:${element.bold ? '700' : '400'};text-align:${element.alignment};color:${element.color};`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString('en-PH') : value.toLocaleString('en-PH', { maximumFractionDigits: 3 });
}

function valueForRow(
  binding: string,
  field: string,
  row: Record<string, unknown>,
): string {
  const value = row[field];
  if (value === null || value === undefined) return '';
  if (field === 'amount' && typeof value === 'number') return peso(value);
  if ((field === 'kg' || field === 'pcs') && typeof value === 'number') return formatNumber(value);
  if (field === 'date' && typeof value === 'string') return longDate(value);
  if (field === 'serviceType' && typeof value === 'string' && value in SERVICE_LABELS) {
    return SERVICE_LABELS[value as keyof typeof SERVICE_LABELS];
  }
  if (field === 'titles' && Array.isArray(value)) return value.join('; ');
  if (binding === 'report.services' && field === 'activities' && typeof value === 'number') return formatNumber(value);
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '';
}

function rowsForBinding(data: ReportData, binding: string): Record<string, unknown>[] {
  switch (binding) {
    case 'report.services': return data.services.map((row) => ({ ...row }));
    case 'report.participantTypes': return data.participantTypes.map((name) => ({ name }));
    case 'report.yield': return data.yield.map((row) => ({ ...row }));
    case 'report.cost': return data.cost.map((row) => ({ ...row }));
    case 'report.sales': return data.sales.map((row) => ({ ...row }));
    case 'report.income': return data.income.map((row) => ({ ...row }));
    case 'report.issues': return data.issues.map((row) => ({ ...row }));
    default: return [];
  }
}

function dynamicValue(input: DocumentRenderInput, binding: string): string {
  switch (binding) {
    case 'report.year': return String(input.year);
    case 'report.quarter': return String(input.quarter);
    case 'report.period.from': return longDate(input.data.from);
    case 'report.period.to': return longDate(input.data.to);
    case 'report.generatedOn': return longDate(input.generatedOn);
    case 'farm.name': return input.document.farm.name;
    case 'farm.shortName': return input.document.farm.shortName;
    case 'signature.name': return input.preparedByName ?? '';
    default: return '';
  }
}

function tableHtml(element: Extract<ReportTemplateDocument['pages'][number]['elements'][number], { type: 'table' }>, data: ReportData): string {
  const columns = element.columns.filter((column) => column.visible);
  const rows = rowsForBinding(data, element.binding);
  if (columns.length === 0) return `<p class="empty-table">${esc(element.emptyText)}</p>`;
  const head = columns.map((column) =>
    `<th style="width:${column.widthPercent}%;text-align:${column.alignment}">${esc(column.label)}</th>`).join('');
  const body = rows.length > 0
    ? rows.map((row) => `<tr>${columns.map((column) =>
      `<td style="width:${column.widthPercent}%;text-align:${column.alignment}">${esc(valueForRow(element.binding, column.field, row))}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${columns.length}" class="empty-cell">${esc(element.emptyText)}</td></tr>`;
  const avoidSplit = element.rowBehavior === 'keep-together' ? 'v2-row-keep' : '';
  const repeatClass = element.repeatHeader ? ' v2-repeat-header' : '';
  return `<table class="v2-table${repeatClass}" style="font-size:${element.fontSizePt}pt"><thead style="background:${element.headerBackground};color:${element.headerColor}"><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
    .replace(/<tr>(?=<td)/g, `<tr class="${avoidSplit}">`);
}

function photoFigure(
  photo: DocumentPhoto,
  index: number,
  heightMm: number,
  fit: 'contain' | 'cover',
  showCaption: boolean,
  widthPercent?: number,
  alignment: 'left' | 'center' | 'right' = 'center',
): string {
  const uri = inlineDataImage(photo.dataUri);
  if (!uri) return '';
  const width = widthPercent === undefined ? '' : `width:${widthPercent}%;`;
  const margin = alignment === 'left' ? '0 auto 0 0' : alignment === 'right' ? '0 0 0 auto' : '0 auto';
  return `<figure class="v2-photo" style="${width}margin:${margin}"><img src="${uri}" alt="" style="height:${heightMm}mm;object-fit:${fit}">${showCaption && photo.caption ? `<figcaption>${esc(photo.caption)}</figcaption>` : ''}<span class="sr-only">Photo ${index + 1}</span></figure>`;
}

function elementHtml(element: ReportTemplateDocument['pages'][number]['elements'][number], input: DocumentRenderInput): string {
  if (element.type === 'page_break') return '<div class="v2-page-break" aria-hidden="true"></div>';

  const p = element.placement;
  const placement = p.mode === 'flow'
    ? `grid-column:${p.column + 1}/span ${p.columnSpan};`
    : `position:absolute;left:${p.x}%;top:${p.y}%;width:${p.width}%;height:${p.height}%;`;
  const classes = [
    'v2-element',
    p.mode === 'positioned' ? 'v2-positioned' : '',
    element.keepTogether ? 'v2-keep' : '',
    element.type === 'photo_group' && !element.continueAcrossPages ? 'v2-keep' : '',
    element.keepWithNext ? 'v2-keep-next' : '',
  ].filter(Boolean).join(' ');
  const style = `${placement}margin-block-start:${element.spacingBeforeMm}mm;margin-block-end:${element.spacingAfterMm}mm;${'fontFamily' in element ? textStyle(element) : ''}`;
  const elementStyle = element.type === 'divider'
    ? `${style}border:0;border-top:${element.thicknessMm}mm solid ${element.color}`
    : element.type === 'logo' ? `${style}text-align:${element.alignment};` : style;
  const attrs = `class="${classes}" data-layout-id="${esc(element.id)}"${p.mode === 'positioned' ? ' data-preflight="positioned"' : ''} style="${elementStyle}"${element.breakBefore === 'page' ? ' data-break-before="page"' : ''}`;

  switch (element.type) {
    case 'report_title':
    case 'section_heading':
    case 'paragraph':
    case 'static_label':
      return `<div ${attrs}>${esc(element.text)}</div>`;
    case 'dynamic_field':
      return `<div ${attrs}>${esc(`${element.prefix}${dynamicValue(input, element.binding)}${element.suffix}`)}</div>`;
    case 'table':
      return `<div ${attrs}>${tableHtml(element, input.data)}</div>`;
    case 'photo_group': {
      const photos = input.photos.slice(element.startIndex, element.startIndex + element.maxPhotos);
      if (photos.length === 0) return `<p ${attrs}>No photos available.</p>`;
      return `<div ${attrs}><div class="v2-photo-grid" style="grid-template-columns:repeat(${element.columns},minmax(0,1fr));justify-items:${element.alignment}">${photos.map((photo, index) =>
        photoFigure(photo, index, element.imageHeightMm, element.fit, element.showCaptions)).join('')}</div></div>`;
    }
    case 'photo':
      return `<div ${attrs}>${photoFigure(input.photos[element.index] ?? { dataUri: '', caption: null }, element.index, element.imageHeightMm, element.fit, element.showCaption, element.widthPercent, element.alignment)}</div>`;
    case 'logo': {
      const logo = inlineDataImage(input.logoDataUri);
      return logo ? `<div ${attrs}><img src="${logo}" alt="" style="width:${element.widthPercent}%;height:${element.imageHeightMm}mm;object-fit:${element.fit}"></div>` : `<div ${attrs}></div>`;
    }
    case 'signature': {
      const name = element.name;
      const date = element.dateMode === 'report_date' ? longDate(input.generatedOn).toUpperCase() : '__________________';
      return `<div ${attrs}><div>${esc(element.preparedByLabel)}</div><div class="v2-signature-line">${name ? esc(name) : '&nbsp;'}</div><div>${esc(element.position)}</div><div>${esc(element.dateLabel)} ${esc(date)}</div></div>`;
    }
    case 'divider':
      return `<hr ${attrs}>`;
    case 'page_number':
      return `<div ${attrs}><span class="v2-page-number" data-format="${esc(element.format)}"></span></div>`;
  }
}

function documentCss(input: DocumentRenderInput): string {
  const pages = input.document.pages.map((page) => {
    const settings = page.settings;
    const [pageWidth, pageHeight] = settings.size === 'a4' ? [297, 210]
      : settings.size === 'letter' ? [279.4, 215.9] : [330.2, 215.9];
    const [width, height] = settings.orientation === 'landscape' ? [pageWidth, pageHeight] : [pageHeight, pageWidth];
    const contentHeight = Math.max(20, height - settings.margins.top - settings.margins.bottom);
    const columnCount = page.layout.mode === 'flow' ? 1 : page.layout.columns;
    return `.v2-page[data-page-id="${page.id}"]{page:${pageName(page.id)};break-after:page;background:${page.backgroundColor ?? 'transparent'};${page.border.enabled && page.border.widthMm > 0 ? `border:${page.border.widthMm}mm solid ${page.border.color};` : ''}}`
      + `.v2-page[data-page-id="${page.id}"] .v2-flow{display:grid;grid-template-columns:repeat(${columnCount},minmax(0,1fr));column-gap:${page.layout.gapMm}mm;min-height:${contentHeight}mm}`
      + `.v2-page[data-page-id="${page.id}"] .v2-position-layer{height:${contentHeight}mm}`;
  }).join('\n');
  const pageNumberStyles = input.document.pages.flatMap((page) => page.elements
    .filter((element) => element.type === 'page_number')
    .map((element) => {
      if (element.type !== 'page_number') return '';
      const content = element.format.split(/(\{page\}|\{pages\})/g).filter(Boolean).map((token) => {
        if (token === '{page}') return 'counter(page)';
        if (token === '{pages}') return 'counter(pages)';
        return cssString(token);
      }).join(' ');
      return `[data-layout-id="${element.id}"] .v2-page-number:before{content:${content || '""'}}`;
    })).join('\n');
  return `${pageCss(input.document, inlineDataImage(input.logoDataUri))}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:Caladea,serif;font-size:10pt;color:#000}
.v2-page{position:relative;break-inside:auto;box-decoration-break:clone}
.v2-flow{align-content:start}
.v2-element{min-width:0;overflow-wrap:anywhere;white-space:pre-wrap}
.v2-element[data-break-before="page"]{break-before:page}
.v2-position-layer{position:absolute;inset:0;pointer-events:none}
.v2-positioned{overflow:visible}
.v2-positioned>*{pointer-events:auto}
.v2-page-break{break-before:page}
.v2-keep{break-inside:avoid-page}
.v2-keep-next{break-after:avoid-page}
.v2-table{width:100%;border-collapse:collapse;table-layout:fixed;break-inside:auto}
.v2-table.v2-repeat-header thead{display:table-header-group}
.v2-table:not(.v2-repeat-header) thead{display:table-row-group}
.v2-table tfoot{display:table-footer-group}
.v2-table th,.v2-table td{border:0.2mm solid #333;padding:1.5mm;vertical-align:top;overflow-wrap:anywhere}
.v2-table tr{break-inside:auto}
.v2-table tr.v2-row-keep{break-inside:avoid-page}
.empty-cell{text-align:center;font-style:italic}
.empty-table{font-style:italic}
.v2-photo-grid{display:grid;gap:3mm;align-items:start}
.v2-photo{margin:0;break-inside:avoid-page;max-width:100%}
.v2-photo img{display:block;width:100%;max-width:100%;object-position:center;border:0.2mm solid #ccc}
.v2-photo figcaption{font-size:8pt;text-align:center;overflow-wrap:anywhere}
.v2-signature-line{min-width:60mm;min-height:8mm;margin-top:8mm;border-bottom:0.2mm solid #000}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media print{.v2-page:last-child{break-after:auto}}
${pageNumberStyles}
${pages}`;
}

function warningsFor(document: ReportTemplateDocument): DocumentLayoutWarning[] {
  const warnings: DocumentLayoutWarning[] = [];
  for (const page of document.pages) {
    const hasElements = page.elements.some((element) => element.type !== 'page_break');
    const hasHeader = page.header.enabled && (page.header.lines.some(Boolean) || page.header.showLogo || page.header.showPageNumber);
    const hasFooter = page.footer.enabled && (page.footer.lines.some(Boolean) || page.footer.showLogo || page.footer.showPageNumber);
    if (!hasElements && !hasHeader && !hasFooter) {
      warnings.push({ elementId: page.id, message: 'This page has no visible content.' });
    }
  }
  return warnings;
}

export function isDocumentTemplate(config: ReportTemplateVersion): config is ReportTemplateDocument {
  return config.schemaVersion === 2;
}

export function renderReportDocumentHtml(input: DocumentRenderInput): DocumentHtmlResult {
  const parsed = reportTemplateDocumentSchema.safeParse(input.document);
  if (!parsed.success) {
    throw new HttpError(422, 'TEMPLATE_INVALID', `The saved report layout is invalid: ${parsed.error.message}`);
  }
  const normalized = { ...input, document: parsed.data };
  const warnings = warningsFor(parsed.data);
  const pages = parsed.data.pages.flatMap((page) => {
    const groups: typeof page.elements[] = [[]];
    for (const element of page.elements) {
      if (element.type === 'page_break') {
        if (groups[groups.length - 1]!.length > 0) groups.push([]);
        continue;
      }
      if (element.breakBefore === 'page' && groups[groups.length - 1]!.length > 0) groups.push([]);
      groups[groups.length - 1]!.push(element);
    }
    return groups.filter((group, index) => group.length > 0 || (groups.length === 1 && index === 0)).map((group) => {
      const regular: string[] = [];
      const positioned: string[] = [];
      for (const element of group) {
        if (element.type === 'page_break') continue;
        const html = elementHtml(element, normalized);
        if (element.placement.mode === 'positioned') positioned.push(html);
        else regular.push(html);
      }
      return `<section class="v2-page" data-page-id="${esc(page.id)}"><div class="v2-flow">${regular.join('')}</div><div class="v2-position-layer">${positioned.join('')}</div></section>`;
    });
  }).join('');
  const title = `${parsed.data.name} ${input.year} Q${input.quarter}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><title>${esc(title)}</title><style>${input.fontCss}${documentCss(normalized)}</style></head><body>${pages}</body></html>`;
  return { html, warnings };
}
