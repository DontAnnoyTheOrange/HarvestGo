import type { ReportData, ReportTemplateConfig, ServiceType } from '@harvestgo/shared';

/** Makes any text safe to place inside a web page: <script> becomes harmless visible text. */
export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------- number and date styles (like the official sample: "Php62.50", "30.986kg") ----------
export const peso = (n: number): string =>
  'Php' +
  (Number.isInteger(n)
    ? n.toLocaleString('en-PH')
    : n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const amount3 = (n: number): string => n.toLocaleString('en-PH', { maximumFractionDigits: 3 });

export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ---------- paper ----------
export function pageDimensions(page: ReportTemplateConfig['page']): { width: string; height: string } {
  const landscape = { long: [13, 8.5, 'in'], a4: [297, 210, 'mm'], letter: [11, 8.5, 'in'] } as const;
  const [w, h, unit] = landscape[page.size];
  return page.orientation === 'landscape' ? { width: `${w}${unit}`, height: `${h}${unit}` } : { width: `${h}${unit}`, height: `${w}${unit}` };
}

export const PDF_MARGIN = { top: '0.5in', right: '0.6in', bottom: '0.7in', left: '0.6in' } as const;

/** The small line at the bottom of every page: form code on the left, page number on the right. */
export function footerTemplate(config: ReportTemplateConfig): string {
  return (
    `<div style="width:100%;padding:0 0.6in;font-size:8px;font-family:'Tinos','Times New Roman',serif;display:flex;justify-content:space-between;">` +
    `<span style="font-style:italic;font-weight:bold;">${esc(config.footerText)}</span>` +
    `<span>Page | <span class="pageNumber"></span></span></div>`
  );
}

const SERVICE_ORDER: ServiceType[] = ['training', 'technical_assistance', 'iec_distribution', 'others'];

export interface ReportHtmlInput {
  config: ReportTemplateConfig;
  data: ReportData;
  year: number;
  quarter: number;
  /** Photos already shrunk and turned into data: addresses (the page may not fetch anything from the internet). */
  photos: string[];
  logoDataUri: string | null;
  /** YYYY-MM-DD, Philippine date of generation. */
  generatedOn: string;
  fontCss: string;
}

const SAFE_IMAGE = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;

const CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:'Cambria','Caladea','Times New Roman','Tinos',serif;font-size:10.5pt;color:#000}
.page{break-after:page}
.page:last-child{break-after:auto}
.hdr{display:flex;align-items:center;justify-content:center;gap:14px;text-align:center;line-height:1.2;margin-bottom:12px}
.hdr img{height:0.75in;width:auto}
.hdr .lines div:nth-child(n+3):nth-child(-n+4){font-weight:bold}
.title{text-align:center;font-weight:bold;text-decoration:underline;margin:20px 0 6px}
.period{text-align:center;font-size:9.5pt;margin:0 0 14px}
.farm{font-weight:bold;margin:0 0 2px}
.farm span{text-decoration:underline}
.sub{font-weight:bold;margin:0 0 8px}
h2.sec{font-size:10.5pt;margin:12px 0 6px;font-weight:bold}
table.grid{width:100%;border-collapse:collapse;table-layout:fixed}
.grid th,.grid td{border:1px solid #000;padding:5px 7px;vertical-align:top;word-wrap:break-word}
.grid th{text-align:center;font-weight:bold}
.grid td.items div{font-weight:bold;text-align:center;margin:1px 0}
.grid td.num{text-align:center}
.grid ol{margin:0;padding-left:20px}
.grid ol li{margin:2px 0}
.grid .titles{padding-left:14px}
.grid td.text{white-space:pre-wrap}
.note{font-style:italic;font-size:9.5pt;margin:4px 0 0}
.photos{display:grid;gap:8px;margin-top:6px}
.photos img{width:100%;object-fit:contain;border:1px solid #bbb}
.sig{margin-top:16px;font-weight:bold}
.sig .label{margin-bottom:26px}
.sig .blank{width:3.2in;border-bottom:1px solid #000;height:0.1in;margin-bottom:2px}
`;

function header(c: ReportTemplateConfig, logo: string | null): string {
  const img = logo && SAFE_IMAGE.test(logo) ? `<img src="${logo}" alt="">` : '';
  const lines = c.header.lines.filter((l) => l.length > 0).map((l) => `<div>${esc(l)}</div>`).join('');
  return `<div class="hdr">${img}<div class="lines">${lines}</div></div>`;
}

function groupedCells(cats: string[], rows: { category: string; text: string }[]): string {
  return cats
    .map((cat) => {
      const items = rows.filter((r) => r.category === cat).map((r) => `<div>${r.text}</div>`).join('');
      return `<td class="items">${items}</td>`;
    })
    .join('');
}

function categoryTable(cats: string[], heading: string, rows: { category: string; text: string }[]): string {
  return (
    `<table class="grid"><thead>` +
    `<tr><th colspan="${cats.length}">${esc(heading)}</th></tr>` +
    `<tr>${cats.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>` +
    `</thead><tbody><tr>${groupedCells(cats, rows)}</tr></tbody></table>`
  );
}

function servicesBlock(c: ReportTemplateConfig, d: ReportData): string {
  const s = c.services;
  const bySvc = new Map(d.services.map((x) => [x.serviceType, x]));
  const items = SERVICE_ORDER.map((t, i) => {
    const found = bySvc.get(t);
    const titles = (found?.titles ?? []).map((x) => `<div class="titles">${esc(x)}</div>`).join('');
    return `<li>${esc(s.serviceLabels[t])}${titles}</li>`;
  }).join('');
  const activities = d.services.reduce((n, x) => n + x.activities, 0);
  const male = d.services.reduce((n, x) => n + x.male, 0);
  const female = d.services.reduce((n, x) => n + x.female, 0);
  const h = s.headings;
  return (
    `<div class="sub">${esc(s.title)}</div>` +
    `<table class="grid"><colgroup><col style="width:14%"><col style="width:32%"><col style="width:6%"><col style="width:24%"><col style="width:8%"><col style="width:8%"><col style="width:8%"></colgroup>` +
    `<thead><tr><th rowspan="2">${esc(h.farm)}</th><th rowspan="2">${esc(h.services)}</th><th rowspan="2">${esc(h.number)}</th>` +
    `<th rowspan="2">${esc(h.participantType)}</th><th colspan="3">${esc(h.participants)}</th></tr>` +
    `<tr><th>${esc(h.male)}</th><th>${esc(h.female)}</th><th>${esc(h.total)}</th></tr></thead>` +
    `<tbody><tr><td>${esc(c.farmShortName)}</td><td><ol>${items}</ol></td><td class="num">${activities}</td>` +
    `<td>${esc(d.participantTypes.map((n) => n.replace(/\s*\([^)]*\)\s*$/, '')).join(', '))}</td><td class="num">${male}</td><td class="num">${female}</td><td class="num">${male + female}</td></tr></tbody></table>` +
    (s.footnote ? `<p class="note">${esc(s.footnote)}</p>` : '')
  );
}

function yieldLine(y: ReportData['yield'][number]): string {
  const parts: string[] = [];
  if (y.kg > 0) parts.push(`${amount3(y.kg)}kg`);
  if (y.pcs > 0) parts.push(`${amount3(y.pcs)} pcs.`);
  return `${esc(y.crop)} ${parts.join(' and ')}`.trim();
}

function section(title: string, body: string, note?: string): string {
  return `<h2 class="sec">${esc(title)}</h2>${body}${note ? `<p class="note">${esc(note)}</p>` : ''}`;
}

function issuesBlock(c: ReportTemplateConfig, d: ReportData): string {
  const h = c.issues.headings;
  const rows = d.issues.length
    ? d.issues
        .map((i) => `<tr><td class="text">${esc(i.problem)}</td><td class="text">${esc(i.actionTaken ?? '')}</td><td class="text">${esc(i.recommendation ?? '')}</td></tr>`)
        .join('')
    : '<tr><td style="height:0.5in"></td><td></td><td></td></tr>';
  return section(
    c.issues.title,
    `<table class="grid"><thead><tr><th>${esc(h.problem)}</th><th>${esc(h.action)}</th><th>${esc(h.recommendation)}</th></tr></thead><tbody>${rows}</tbody></table>`,
  );
}

function photosBlock(c: ReportTemplateConfig, photos: string[]): string {
  const safe = photos.filter((p) => SAFE_IMAGE.test(p)).slice(0, c.photos.maxPhotos);
  const rows = Math.max(1, Math.ceil(safe.length / c.photos.columns));
  const heightIn = Math.min(2.4, 3.4 / rows).toFixed(2);
  const imgs = safe.map((p) => `<img src="${p}" alt="" style="height:${heightIn}in">`).join('');
  return section(c.photos.title, `<div class="photos" style="grid-template-columns:repeat(${c.photos.columns},1fr)">${imgs}</div>`);
}

function signatureBlock(c: ReportTemplateConfig, generatedOn: string): string {
  const s = c.signature;
  const date = s.dateMode === 'report_date' ? longDate(generatedOn).toUpperCase() : '__________________';
  return (
    `<div class="sig"><div class="label">${esc(s.preparedByLabel)}</div>` +
    (s.name ? `<div>${esc(s.name)}</div>` : '<div class="blank"></div>') +
    `<div>${esc(s.position)}</div><div>${esc(s.dateLabel)} ${esc(date)}</div></div>`
  );
}

/** Builds the whole report as one self-contained web page. Everything typed by people is escaped. */
export function renderReportHtml(input: ReportHtmlInput): string {
  const { config: c, data: d } = input;
  const hdr = header(c, input.logoDataUri);
  const cats = [...d.categories];
  for (const r of [...d.yield.map((y) => y.category), ...d.cost.map((x) => x.category), ...d.sales.map((x) => x.category), ...d.income.map((x) => x.category)]) {
    if (!cats.includes(r)) cats.push(r);
  }
  const money = (rows: ReportData['cost']) => rows.map((r) => ({ category: r.category, text: `${esc(r.label)} - ${esc(peso(r.amount))}` }));

  const pages: string[] = [];

  if (c.services.enabled) {
    const period = c.showPeriod ? `<p class="period">For the period ${esc(longDate(d.from))} to ${esc(longDate(d.to))}</p>` : '';
    pages.push(
      `${hdr}<div class="title">${esc(c.reportTitle)}</div>${period}` +
        `<p class="farm">${esc(c.farmLabel)} <span>${esc(c.farmName)}</span></p>` +
        servicesBlock(c, d),
    );
  }

  const ab: string[] = [];
  if (c.production.enabled) {
    ab.push(section(c.production.title, categoryTable(cats, c.production.heading, d.yield.map((y) => ({ category: y.category, text: yieldLine(y) }))), c.production.note));
  }
  if (c.cost.enabled) ab.push(section(c.cost.title, categoryTable(cats, c.cost.heading, money(d.cost)), c.cost.note));
  if (ab.length) pages.push(hdr + ab.join(''));

  const cd: string[] = [];
  if (c.sales.enabled) cd.push(section(c.sales.title, categoryTable(cats, c.sales.heading, money(d.sales)), c.sales.note));
  if (c.income.enabled) cd.push(section(c.income.title, categoryTable(cats, c.income.heading, money(d.income)), c.income.note));
  if (cd.length) pages.push(hdr + cd.join(''));

  if (c.issues.enabled) pages.push(hdr + issuesBlock(c, d));

  const last: string[] = [];
  if (c.photos.enabled) last.push(photosBlock(c, input.photos));
  if (c.signature.enabled) last.push(signatureBlock(c, input.generatedOn));
  if (last.length) pages.push(hdr + last.join(''));

  const title = `${c.reportTitle} ${input.year} Q${input.quarter}`;
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:">` +
    `<title>${esc(title)}</title><style>${input.fontCss}${CSS}</style></head><body>` +
    pages.map((p) => `<div class="page">${p}</div>`).join('') +
    `</body></html>`
  );
}