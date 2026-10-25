import { describe, expect, it } from 'vitest';
import { OFFICIAL_TEMPLATE_CONFIG, type ReportData, type ReportTemplateConfig } from '@harvestgo/shared';
import { esc, footerTemplate, longDate, pageDimensions, peso, renderReportHtml } from './reports/reportHtml.js';

const data: ReportData = {
  from: '2025-04-01', to: '2025-06-30',
  categories: ['Rice', 'Vegetables', 'Fruits', 'Poultry', 'Livestock', 'Others'],
  services: [{ serviceType: 'training', activities: 1, titles: ['Mushroom Cultivation Seminar'], male: 17, female: 44 }],
  participantTypes: ['Farmers', 'Farm Youth (13-30 years old and single)', 'Private Groups'],
  yield: [
    { category: 'Vegetables', crop: 'Mushroom', kg: 30.986, pcs: 0 }, { category: 'Vegetables', crop: 'Sitaw', kg: 0.8, pcs: 0 },
    { category: 'Fruits', crop: 'Buko', kg: 0, pcs: 45 },
  ],
  cost: [{ category: 'Vegetables', label: 'Mushroom', amount: 4958 }, { category: 'Vegetables', label: 'Chinese Kangkong', amount: 62.5 }],
  sales: [{ category: 'Vegetables', label: 'Mushroom', amount: 4958 }],
  income: [{ category: 'Vegetables', label: 'Mushroom Chips', amount: 3052 }, { category: 'Fruits', label: 'Buko Shake', amount: 186 }],
  issues: [{ date: '2025-06-01', problem: 'Keeping accurate records of all harvest', actionTaken: 'Orientation of staff', recommendation: 'In-depth training on record keeping' }],
};
const jpegUri = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const make = (over: Partial<Parameters<typeof renderReportHtml>[0]> = {}, config: ReportTemplateConfig = OFFICIAL_TEMPLATE_CONFIG) =>
  renderReportHtml({ config, data, year: 2025, quarter: 2, photos: [], logoDataUri: null, generatedOn: '2025-07-01', fontCss: '', ...over });
const pageCount = (html: string) => (html.match(/<div class="page">/g) ?? []).length;

describe('numbers and dates are shown like the official sample', () => {
  it('writes yield, cost and income lines', () => {
    const html = make();
    expect(html).toContain('Mushroom 30.986kg');
    expect(html).toContain('Sitaw 0.8kg');
    expect(html).toContain('Buko 45 pcs.');
    expect(html).toContain('Mushroom - Php4,958');
    expect(html).toContain('Chinese Kangkong - Php62.50');
    expect(html).toContain('Mushroom Chips - Php3,052');
    expect(html).toContain('Buko Shake - Php186');
  });
  it('formats pesos and dates', () => {
    expect(peso(4958)).toBe('Php4,958');
    expect(peso(62.5)).toBe('Php62.50');
    expect(longDate('2025-06-30')).toBe('June 30, 2025');
  });
  it('shows the head-count totals (the ATI sample: 17 / 44 / 61)', () => {
    const html = make();
    expect(html).toContain('<td class="num">17</td><td class="num">44</td><td class="num">61</td>');
    expect(html).toContain('Mushroom Cultivation Seminar');
    expect(html).toContain('Farmers, Farm Youth, Private Groups'); // short names, like the official sample
    expect(html).toContain('<td>Kabutihan Farm</td>');
  });
  it('lists all four kinds of service, and the six product groups', () => {
    const html = make();
    for (const label of ['Trainings/Briefings/Orientation', 'Technical Assistance', 'IEC Materials Distribution', 'Others, Specify']) expect(html).toContain(label);
    for (const cat of ['Rice', 'Vegetables', 'Fruits', 'Poultry', 'Livestock', 'Others']) expect(html).toContain(`<th>${cat}</th>`);
  });
  it('shows the period line, and the signature date in capitals', () => {
    const html = make();
    expect(html).toContain('For the period April 1, 2025 to June 30, 2025');
    expect(html).toContain('Date: JULY 1, 2025');
    expect(html).toContain('GENERAL MANAGER');
  });
});

describe('layout', () => {
  it('makes the five pages of the official form', () => {
    expect(pageCount(make())).toBe(5);
  });
  it('leaves out sections the template switches off', () => {
    const c = structuredClone(OFFICIAL_TEMPLATE_CONFIG);
    c.production.enabled = false;
    c.cost.enabled = false;
    c.signature.enabled = false;
    const html = make({}, c);
    expect(pageCount(html)).toBe(4);
    expect(html).not.toContain('A. PRODUCTION DATA');
    expect(html).not.toContain('Prepared and submitted by');
  });
  it('supports a blank signature date and a typed name', () => {
    const c = structuredClone(OFFICIAL_TEMPLATE_CONFIG);
    c.signature.dateMode = 'blank';
    c.signature.name = 'JUAN DELA CRUZ';
    const html = make({}, c);
    expect(html).toContain('__________________');
    expect(html).toContain('JUAN DELA CRUZ');
  });
  it('shows an empty issues table when there are none', () => {
    expect(make({ data: { ...data, issues: [] } })).toContain('height:0.5in');
  });
  it('chooses the paper size', () => {
    expect(pageDimensions({ size: 'long', orientation: 'landscape' })).toEqual({ width: '13in', height: '8.5in' });
    expect(pageDimensions({ size: 'long', orientation: 'portrait' })).toEqual({ width: '8.5in', height: '13in' });
    expect(pageDimensions({ size: 'a4', orientation: 'landscape' })).toEqual({ width: '297mm', height: '210mm' });
    expect(pageDimensions({ size: 'letter', orientation: 'portrait' })).toEqual({ width: '8.5in', height: '11in' });
  });
  it('puts the form code and page numbers in the footer', () => {
    const f = footerTemplate(OFFICIAL_TEMPLATE_CONFIG);
    expect(f).toContain('ATI-QF/PAD-119 Rev. 00');
    expect(f).toContain('class="pageNumber"');
  });
});

describe('photos', () => {
  it('places safe embedded photos, no more than the template allows', () => {
    const c = structuredClone(OFFICIAL_TEMPLATE_CONFIG);
    c.photos.maxPhotos = 2;
    const html = make({ photos: [jpegUri, jpegUri, jpegUri] }, c);
    expect((html.match(/<img src="data:image\/jpeg/g) ?? []).length).toBe(2);
  });
  it('refuses any picture that is not an embedded JPEG/PNG (no web addresses, no scripts)', () => {
    const html = make({
      photos: ['http://evil.example/x.jpg', 'javascript:alert(1)', 'file:///etc/passwd', 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/jpeg;base64,"onerror="alert(1)'],
      logoDataUri: 'https://evil.example/logo.png',
    });
    expect(html).not.toContain('evil.example');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('file:///');
    expect(html).not.toContain('text/html');
    expect(html).not.toContain('onerror');
  });
  it('accepts an embedded logo', () => {
    expect(make({ logoDataUri: jpegUri })).toContain(`<img src="${jpegUri}" alt="">`);
  });
});

describe('SECURITY: anything people type is made harmless', () => {
  const evil = '<script>alert(1)</script><img src=x onerror=alert(2)>"\'&';
  it('escapes text', () => {
    expect(esc(evil)).toBe('&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(2)&gt;&quot;&#39;&amp;');
  });
  it('shows <script> as plain visible text in every place text can appear', () => {
    const c = structuredClone(OFFICIAL_TEMPLATE_CONFIG);
    c.farmName = evil; c.farmShortName = evil; c.reportTitle = evil; c.footerText = evil; c.header.lines = [evil];
    c.signature.name = evil; c.services.footnote = evil;
    const html = make({
      data: {
        ...data,
        services: [{ serviceType: 'training', activities: 1, titles: [evil], male: 1, female: 1 }],
        participantTypes: [evil],
        yield: [{ category: 'Vegetables', crop: evil, kg: 1, pcs: 0 }],
        cost: [{ category: 'Vegetables', label: evil, amount: 1 }],
        issues: [{ date: '2025-06-01', problem: evil, actionTaken: evil, recommendation: evil }],
      },
    }, c);
    expect(html).not.toMatch(/<script/i); // no script tag anywhere
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
    expect(footerTemplate(c)).not.toMatch(/<script/i);
  });
  it('tells the browser it may load nothing from the internet', () => {
    expect(make()).toContain(`content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"`);
  });
});