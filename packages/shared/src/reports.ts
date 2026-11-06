import { z } from 'zod';
import { serviceTypeSchema } from './activities.js';

// ====================================================================
// REPORT TEMPLATE V1: the fixed official layout settings. The structured v2
// document model below is separate so existing templates keep their renderer.
// ====================================================================
const text = (max: number) => z.string().trim().max(max, { error: `Too long (${max} characters max).` });
const section = { enabled: z.boolean(), title: text(160) };

export const PAGE_SIZES = ['long', 'a4', 'letter'] as const;
export const PAGE_ORIENTATIONS = ['landscape', 'portrait'] as const;
export const SIGNATURE_DATE_MODES = ['report_date', 'blank'] as const;

export const reportTemplateConfigSchema = z.object({
  schemaVersion: z.literal(1),
  page: z.object({ size: z.enum(PAGE_SIZES), orientation: z.enum(PAGE_ORIENTATIONS) }),
  header: z.object({
    lines: z.array(text(120)).max(6),
    /** Path of a logo image in the private template-assets bucket (set by the template editor). */
    logoPath: z.string().max(300).nullable(),
  }),
  reportTitle: text(120),
  showPeriod: z.boolean(),
  farmLabel: text(60),
  farmName: text(160),
  /** The short name printed in the "Name of Farm" column of the Services table. */
  farmShortName: text(80),
  footerText: text(200),
  services: z.object({
    ...section,
    headings: z.object({
      farm: text(60), services: text(60), number: text(20), participantType: text(60),
      participants: text(60), male: text(20), female: text(20), total: text(20),
    }),
    serviceLabels: z.object({
      training: text(80), technical_assistance: text(80), iec_distribution: text(80), others: text(80),
    }),
    footnote: text(600),
  }),
  production: z.object({ ...section, heading: text(80), note: text(200) }),
  cost: z.object({ ...section, heading: text(80), note: text(200) }),
  sales: z.object({ ...section, heading: text(80), note: text(200) }),
  income: z.object({ ...section, heading: text(80), note: text(200) }),
  issues: z.object({
    ...section,
    headings: z.object({ problem: text(80), action: text(80), recommendation: text(80) }),
  }),
  photos: z.object({
    ...section,
    columns: z.number().int().min(1).max(4),
    maxPhotos: z.number().int().min(1).max(12),
  }),
  signature: z.object({
    enabled: z.boolean(),
    preparedByLabel: text(80),
    /** Left empty = a blank line to sign by hand. */
    name: text(100),
    position: text(80),
    dateLabel: text(30),
    dateMode: z.enum(SIGNATURE_DATE_MODES),
  }),
});
export type ReportTemplateConfig = z.infer<typeof reportTemplateConfigSchema>;

const templateColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const templateElementIdSchema = z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/);
const templateMarginsSchema = z.object({
  top: z.number().min(0).max(50),
  right: z.number().min(0).max(50),
  bottom: z.number().min(0).max(50),
  left: z.number().min(0).max(50),
});
const templatePageSettingsSchema = z.object({
  size: z.enum(PAGE_SIZES),
  orientation: z.enum(PAGE_ORIENTATIONS),
  margins: templateMarginsSchema,
});
const templatePageRegionSchema = z.object({
  enabled: z.boolean(),
  lines: z.array(text(160)).max(6),
  alignment: z.enum(['left', 'center', 'right']),
  showLogo: z.boolean(),
  showPageNumber: z.boolean(),
});
const templateElementPlacementSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('flow'),
    column: z.number().int().min(0).max(3),
    columnSpan: z.number().int().min(1).max(4),
  }),
  z.object({
    mode: z.literal('positioned'),
    x: z.number().min(0).max(99),
    y: z.number().min(0).max(99),
    width: z.number().min(1).max(100),
    height: z.number().min(1).max(100),
  }),
]);
const templateElementBase = {
  id: templateElementIdSchema,
  placement: templateElementPlacementSchema,
  breakBefore: z.enum(['auto', 'page']).default('auto'),
  keepTogether: z.boolean().default(false),
  keepWithNext: z.boolean().default(false),
  spacingBeforeMm: z.number().min(0).max(50).default(0),
  spacingAfterMm: z.number().min(0).max(50).default(0),
};
const templateTextStyle = {
  fontFamily: z.enum(['serif', 'sans-serif']).default('serif'),
  fontSizePt: z.number().min(6).max(72).default(10),
  bold: z.boolean().default(false),
  alignment: z.enum(['left', 'center', 'right']).default('left'),
  color: templateColorSchema.default('#000000'),
};
const templateTableBindingSchema = z.enum([
  'report.services', 'report.participantTypes', 'report.yield', 'report.cost', 'report.sales', 'report.income', 'report.issues',
]);
const templateTableColumnSchema = z.object({
  field: z.enum([
    'serviceType', 'activities', 'titles', 'male', 'female',
    'name', 'category', 'crop', 'kg', 'pcs', 'label', 'amount',
    'date', 'problem', 'actionTaken', 'recommendation',
  ]),
  label: text(100),
  widthPercent: z.number().min(1).max(100),
  alignment: z.enum(['left', 'center', 'right']),
  visible: z.boolean().default(true),
});
const templatePhotoSettings = {
  columns: z.number().int().min(1).max(6),
  imageHeightMm: z.number().min(20).max(250),
  fit: z.enum(['contain', 'cover']),
  alignment: z.enum(['left', 'center', 'right']),
  showCaptions: z.boolean(),
  maxPhotos: z.number().int().min(1).max(12),
  continueAcrossPages: z.boolean(),
};

const templateElementSchema = z.discriminatedUnion('type', [
  z.object({ ...templateElementBase, type: z.literal('report_title'), text: text(160), ...templateTextStyle }),
  z.object({ ...templateElementBase, type: z.literal('section_heading'), text: text(160), ...templateTextStyle }),
  z.object({ ...templateElementBase, type: z.literal('paragraph'), text: text(4000), ...templateTextStyle }),
  z.object({ ...templateElementBase, type: z.literal('static_label'), text: text(300), ...templateTextStyle }),
  z.object({
    ...templateElementBase,
    type: z.literal('dynamic_field'),
    binding: z.enum([
      'report.year', 'report.quarter', 'report.period.from', 'report.period.to', 'report.generatedOn',
      'farm.name', 'farm.shortName', 'signature.name',
    ]),
    prefix: z.string().max(100).default(''),
    suffix: z.string().max(100).default(''),
    ...templateTextStyle,
  }),
  z.object({
    ...templateElementBase,
    type: z.literal('table'),
    binding: templateTableBindingSchema,
    columns: z.array(templateTableColumnSchema).min(1).max(15),
    fontSizePt: z.number().min(6).max(24),
    headerBackground: templateColorSchema,
    headerColor: templateColorSchema,
    repeatHeader: z.boolean(),
    rowBehavior: z.enum(['allow-split', 'keep-together']),
    emptyText: text(300),
  }),
  z.object({
    ...templateElementBase,
    type: z.literal('photo_group'),
    binding: z.literal('report.photos'),
    startIndex: z.number().int().min(0).max(11),
    ...templatePhotoSettings,
  }),
  z.object({
    ...templateElementBase,
    type: z.literal('photo'),
    binding: z.literal('report.photos'),
    index: z.number().int().min(0).max(99),
    widthPercent: z.number().min(1).max(100),
    imageHeightMm: z.number().min(20).max(250),
    fit: z.enum(['contain', 'cover']),
    alignment: z.enum(['left', 'center', 'right']),
    showCaption: z.boolean(),
  }),
  z.object({
    ...templateElementBase,
    type: z.literal('logo'),
    widthPercent: z.number().min(1).max(100),
    imageHeightMm: z.number().min(5).max(100),
    fit: z.enum(['contain', 'cover']),
    alignment: z.enum(['left', 'center', 'right']),
  }),
  z.object({
    ...templateElementBase,
    type: z.literal('signature'),
    preparedByLabel: text(100),
    name: text(100),
    position: text(100),
    dateLabel: text(40),
    dateMode: z.enum(SIGNATURE_DATE_MODES),
    ...templateTextStyle,
  }),
  z.object({ ...templateElementBase, type: z.literal('divider'), color: templateColorSchema, thicknessMm: z.number().min(0.1).max(5) }),
  z.object({ ...templateElementBase, type: z.literal('page_number'), format: text(40), ...templateTextStyle }),
  z.object({ id: templateElementIdSchema, type: z.literal('page_break') }),
]);

const templatePageSchema = z.object({
  id: templateElementIdSchema,
  name: text(100),
  settings: templatePageSettingsSchema,
  layout: z.object({
    mode: z.enum(['flow', 'columns', 'hybrid']),
    columns: z.number().int().min(1).max(4),
    gapMm: z.number().min(0).max(30),
  }),
  backgroundColor: templateColorSchema.nullable(),
  border: z.object({
    enabled: z.boolean(),
    color: templateColorSchema,
    widthMm: z.number().min(0).max(5),
  }),
  header: templatePageRegionSchema,
  footer: templatePageRegionSchema,
  elements: z.array(templateElementSchema).max(100),
});

const tableFieldsByBinding: Record<z.infer<typeof templateTableBindingSchema>, readonly string[]> = {
  'report.services': ['serviceType', 'activities', 'titles', 'male', 'female'],
  'report.participantTypes': ['name'],
  'report.yield': ['category', 'crop', 'kg', 'pcs'],
  'report.cost': ['category', 'label', 'amount'],
  'report.sales': ['category', 'label', 'amount'],
  'report.income': ['category', 'label', 'amount'],
  'report.issues': ['date', 'problem', 'actionTaken', 'recommendation'],
};

/** Structured v2 document model. It is not consumed by the v1 PDF renderer. */
export const reportTemplateDocumentSchema = z.object({
  schemaVersion: z.literal(2),
  name: text(100),
  farm: z.object({ name: text(160), shortName: text(80) }),
  logoPath: z.string().max(300).nullable(),
  pages: z.array(templatePageSchema).min(1).max(50),
}).superRefine((document, ctx) => {
  const pageIds = new Set<string>();
  const elementIds = new Set<string>();

  document.pages.forEach((page, pageIndex) => {
    if (pageIds.has(page.id)) {
      ctx.addIssue({ code: 'custom', path: ['pages', pageIndex, 'id'], message: 'Page IDs must be unique.' });
    }
    pageIds.add(page.id);

    if (page.layout.mode === 'flow' && page.layout.columns !== 1) {
      ctx.addIssue({ code: 'custom', path: ['pages', pageIndex, 'layout', 'columns'], message: 'Flow pages must have exactly one column.' });
    }

    const [pageWidthMm, pageHeightMm] = page.settings.size === 'a4' ? [297, 210]
      : page.settings.size === 'letter' ? [279.4, 215.9] : [330.2, 215.9];
    const [orientedWidth, orientedHeight] = page.settings.orientation === 'landscape'
      ? [pageWidthMm, pageHeightMm]
      : [pageHeightMm, pageWidthMm];
    if (page.settings.margins.left + page.settings.margins.right >= orientedWidth
      || page.settings.margins.top + page.settings.margins.bottom >= orientedHeight) {
      ctx.addIssue({ code: 'custom', path: ['pages', pageIndex, 'settings', 'margins'], message: 'Page margins leave no printable area.' });
    }

    page.elements.forEach((element, elementIndex) => {
      const path = ['pages', pageIndex, 'elements', elementIndex] as (string | number)[];
      if (elementIds.has(element.id)) {
        ctx.addIssue({ code: 'custom', path: [...path, 'id'], message: 'Element IDs must be unique across the document.' });
      }
      elementIds.add(element.id);

      if (element.type === 'page_break') return;

      if (element.placement.mode === 'positioned') {
        if (element.placement.x + element.placement.width > 100 || element.placement.y + element.placement.height > 100) {
          ctx.addIssue({ code: 'custom', path: [...path, 'placement'], message: 'Positioned elements must fit inside the page content area.' });
        }
        if (page.layout.mode !== 'hybrid') {
          ctx.addIssue({ code: 'custom', path: [...path, 'placement', 'mode'], message: 'Positioned elements require a hybrid page layout.' });
        }
      } else {
        if (element.placement.column + element.placement.columnSpan > page.layout.columns) {
          ctx.addIssue({ code: 'custom', path: [...path, 'placement'], message: 'Element placement exceeds the page column count.' });
        }
      }

      if (element.type === 'table') {
        if (element.placement.mode !== 'flow') {
          ctx.addIssue({ code: 'custom', path: [...path, 'placement', 'mode'], message: 'Tables must use document flow so rows can continue across pages.' });
        }
        const allowedFields = tableFieldsByBinding[element.binding];
        const fields = new Set<string>();
        let totalWidth = 0;
        element.columns.forEach((column, columnIndex) => {
          totalWidth += column.widthPercent;
          if (fields.has(column.field)) {
            ctx.addIssue({
              code: 'custom',
              path: [...path, 'columns', columnIndex, 'field'],
              message: 'Table fields cannot be repeated.',
            });
          }
          fields.add(column.field);
          if (!allowedFields.includes(column.field)) {
            ctx.addIssue({
              code: 'custom',
              path: [...path, 'columns', columnIndex, 'field'],
              message: `Field "${column.field}" is not available from ${element.binding}.`,
            });
          }
        });
        if (totalWidth > 100) {
          ctx.addIssue({ code: 'custom', path: [...path, 'columns'], message: 'Table column widths cannot exceed 100%.' });
        }
      }

      if (element.type === 'photo_group' && element.placement.mode !== 'flow') {
        ctx.addIssue({ code: 'custom', path: [...path, 'placement', 'mode'], message: 'Photo groups must use document flow to support continuation.' });
      }
      if (element.type === 'photo_group' && element.startIndex + element.maxPhotos > 12) {
        ctx.addIssue({ code: 'custom', path: [...path, 'startIndex'], message: 'A photo group cannot extend beyond the 12-photo report limit.' });
      }
    });

    const positioned = page.elements.filter((element) => element.type !== 'page_break' && element.placement.mode === 'positioned');
    for (let i = 0; i < positioned.length; i += 1) {
      const current = positioned[i];
      if (!current || current.type === 'page_break' || current.placement.mode !== 'positioned') continue;
      for (let j = i + 1; j < positioned.length; j += 1) {
        const other = positioned[j];
        if (!other || other.type === 'page_break' || other.placement.mode !== 'positioned') continue;
        const overlaps = current.placement.x < other.placement.x + other.placement.width
          && current.placement.x + current.placement.width > other.placement.x
          && current.placement.y < other.placement.y + other.placement.height
          && current.placement.y + current.placement.height > other.placement.y;
        if (overlaps) {
          ctx.addIssue({
            code: 'custom',
            path: ['pages', pageIndex, 'elements'],
            message: `Positioned elements "${current.id}" and "${other.id}" overlap.`,
          });
        }
      }
    }
  });
});
export type ReportTemplateDocument = z.infer<typeof reportTemplateDocumentSchema>;
export const reportTemplateVersionSchema = z.union([reportTemplateConfigSchema, reportTemplateDocumentSchema]);
export type ReportTemplateVersion = z.infer<typeof reportTemplateVersionSchema>;

export const OFFICIAL_TEMPLATE_NAME = 'Official ATI-QF/PAD-119 Rev. 00';

/** The layout of the official DA-ATI RTC IV-A "Quarterly Accomplishment Report" (form ATI-QF/PAD-119 Rev. 00). */
export const OFFICIAL_TEMPLATE_CONFIG: ReportTemplateConfig = {
  schemaVersion: 1,
  page: { size: 'long', orientation: 'landscape' }, // 13 x 8.5 inches, like the form
  header: {
    lines: [
      'Republic of the Philippines',
      'DEPARTMENT OF AGRICULTURE',
      'AGRICULTURAL TRAINING INSTITUTE',
      'Regional Training Center IV-A',
      'Brgy. Lapidario, Trece Martires City, Cavite',
    ],
    logoPath: null,
  },
  reportTitle: 'QUARTERLY ACCOMPLISHMENT REPORT',
  showPeriod: true,
  farmLabel: 'NAME OF FARM:',
  farmName: 'KABUTIHAN INCORPORATED (KABUTIHAN FARM)',
  farmShortName: 'Kabutihan Farm',
  footerText: 'ATI-QF/PAD-119 Rev. 00 Effectivity Date: September 10, 2020',
  services: {
    enabled: true,
    title: 'Services Rendered and Clientele Served',
    headings: {
      farm: 'Name of Farm', services: 'Services Rendered', number: 'No.', participantType: 'Type of Participants*',
      participants: 'Number of participants', male: 'Male', female: 'Female', total: 'Total',
    },
    serviceLabels: {
      training: 'Trainings/Briefings/Orientation',
      technical_assistance: 'Technical Assistance',
      iec_distribution: 'IEC Materials Distribution',
      others: 'Others, Specify',
    },
    footnote:
      '*Type of Participants-Farmers, Farm Youth (13-30 years old and single), LGU AEWs, LGU Officials, Agency personnel, NGO\u2019s, Private Groups, SUC Personnel, Students, Tourists, Others, specify',
  },
  production: {
    enabled: true, title: 'A. PRODUCTION DATA', heading: 'YIELD (in kilograms)',
    note: '*Specify the kind of vegetables, fruits, poultry, livestock, and other component',
  },
  cost: {
    enabled: true, title: 'B. COST OF PRODUCTION', heading: 'COST(in pesos)',
    note: '*Specify the kind of vegetables, fruits, poultry, livestock, and other components',
  },
  sales: {
    enabled: true, title: 'C. PRODUCTION SALES', heading: 'SALES(in pesos)',
    note: '*Specify the kind of vegetables, fruits, poultry, livestock, and other components',
  },
  income: { enabled: true, title: 'D. PRODUCTION INCOME', heading: 'INCOME (in pesos)', note: '' },
  issues: {
    enabled: true,
    title: 'E. PROBLEMS/DIFFICULTIES ENCOUNTERED, ACTIONS TAKEN AND RECOMMENDATIONS',
    headings: { problem: 'PROBLEMS/DIFFICULTIES ENCOUNTERED', action: 'ACTIONS TAKEN', recommendation: 'RECOMMENDATIONS' },
  },
  photos: { enabled: true, title: 'G. PHOTO DOCUMENTATION', columns: 3, maxPhotos: 6 },
  signature: {
    enabled: true,
    preparedByLabel: 'Prepared and submitted by:',
    name: '',
    position: 'GENERAL MANAGER',
    dateLabel: 'Date:',
    dateMode: 'report_date',
  },
};

export const reportTemplateRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number(),
  isActive: z.boolean(),
  config: reportTemplateVersionSchema,
  createdAt: z.string(),
});
export type ReportTemplateRecord = z.infer<typeof reportTemplateRecordSchema>;
export const activeTemplateSchema = z.object({ template: reportTemplateRecordSchema.nullable() });
export const reportTemplateDraftResponseSchema = z.object({
  draft: z.object({ document: reportTemplateDocumentSchema, updatedAt: z.string() }).nullable(),
});

// ====================================================================
// REPORT DATA (the numbers for one quarter, added up by the database)
// ====================================================================
const line = z.object({ category: z.string(), label: z.string(), amount: z.coerce.number() });

export const reportDataSchema = z.object({
  from: z.string(),
  to: z.string(),
  categories: z.array(z.string()),
  services: z.array(
    z.object({
      serviceType: serviceTypeSchema,
      activities: z.number(),
      titles: z.array(z.string()),
      male: z.number(),
      female: z.number(),
    }),
  ),
  participantTypes: z.array(z.string()),
  yield: z.array(z.object({ category: z.string(), crop: z.string(), kg: z.coerce.number(), pcs: z.coerce.number() })),
  cost: z.array(line),
  sales: z.array(line),
  income: z.array(line),
  issues: z.array(
    z.object({
      date: z.string(),
      problem: z.string(),
      actionTaken: z.string().nullable(),
      recommendation: z.string().nullable(),
    }),
  ),
});
export type ReportData = z.infer<typeof reportDataSchema>;

// ====================================================================
// MAKING AND LISTING REPORTS
// ====================================================================
const period = {
  year: z.coerce.number().int().min(2020, { error: 'Choose a year from 2020.' }).max(2100),
  quarter: z.coerce.number().int().min(1, { error: 'Choose a quarter from 1 to 4.' }).max(4, { error: 'Choose a quarter from 1 to 4.' }),
};

export const previewReportQuery = z.object(period);

const reportPhotoIdsSchema = z
  .array(z.uuid({ error: 'Choose photos from the list.' }))
  .max(12, { error: 'Choose at most 12 photos.' })
  .refine((ids) => new Set(ids).size === ids.length, { error: 'Each photo can be chosen only once.' });

export const generateReportSchema = z.object({
  year: period.year,
  quarter: period.quarter,
  photoIds: reportPhotoIdsSchema,
});
export type GenerateReportInput = z.infer<typeof generateReportSchema>;

export const reportTemplatePreviewSchema = z.object({
  document: reportTemplateDocumentSchema,
  year: period.year,
  quarter: period.quarter,
  photoIds: reportPhotoIdsSchema.default([]),
});
export type ReportTemplatePreviewInput = z.infer<typeof reportTemplatePreviewSchema>;

export const listReportsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  year: period.year.optional(),
  quarter: period.quarter.optional(),
});
export type ListReportsQuery = z.infer<typeof listReportsQuery>;

export const reportRecordSchema = z.object({
  id: z.string(),
  periodYear: z.number(),
  periodQuarter: z.number(),
  templateName: z.string(),
  templateVersion: z.number(),
  fileName: z.string(),
  sizeBytes: z.number().nullable(),
  photoCount: z.number(),
  generatedBy: z.string(),
  generatedByName: z.string(),
  generatedAt: z.string(),
});
export type ReportRecord = z.infer<typeof reportRecordSchema>;
export const reportListSchema = z.object({
  records: z.array(reportRecordSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type ReportList = z.infer<typeof reportListSchema>;

export const reportUrlSchema = z.object({ url: z.string(), expiresInSeconds: z.number() });
export type ReportUrl = z.infer<typeof reportUrlSchema>;