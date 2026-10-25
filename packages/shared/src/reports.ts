import { z } from 'zod';
import { serviceTypeSchema } from './activities.js';

// ====================================================================
// REPORT TEMPLATE (what the PDF looks like). The General Manager's template
// editor (a later step) changes these settings; it never accepts raw HTML.
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
  config: reportTemplateConfigSchema,
  createdAt: z.string(),
});
export type ReportTemplateRecord = z.infer<typeof reportTemplateRecordSchema>;
export const activeTemplateSchema = z.object({ template: reportTemplateRecordSchema.nullable() });

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

export const generateReportSchema = z.object({
  year: period.year,
  quarter: period.quarter,
  photoIds: z
    .array(z.uuid({ error: 'Choose photos from the list.' }))
    .max(12, { error: 'Choose at most 12 photos.' })
    .refine((ids) => new Set(ids).size === ids.length, { error: 'Each photo can be chosen only once.' }),
});
export type GenerateReportInput = z.infer<typeof generateReportSchema>;

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