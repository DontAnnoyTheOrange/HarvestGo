import { z } from 'zod';
import { isValidIsoDate, todayInManila } from './farm.js';

// ---------------- Dates and text ----------------
const isoDate = z
  .string({ error: 'Enter a valid date.' })
  .refine(isValidIsoDate, { error: 'Enter a valid date.' })
  .refine((s) => s >= '2020-01-01', { error: 'That date is too far in the past.' });
const pastOrToday = isoDate.refine((s) => s <= todayInManila(), { error: 'The date cannot be in the future.' });

const optionalText = (max: number, tooLong: string) =>
  z.string().trim().max(max, { error: tooLong }).nullish().transform((v) => (v ? v : null));
const optionalUuid = z.uuid({ error: 'Choose an item from the list.' }).nullish().transform((v) => v ?? null);

// ---------------- Participant types (reference list) ----------------
export const participantTypeSchema = z.object({ id: z.number(), name: z.string() });
export type ParticipantType = z.infer<typeof participantTypeSchema>;

// ---------------- Service activities (ATI "Services Rendered") ----------------
export const SERVICE_TYPES = ['training', 'technical_assistance', 'iec_distribution', 'others'] as const;
export const serviceTypeSchema = z.enum(SERVICE_TYPES, { error: 'Choose the kind of service.' });
export type ServiceType = z.infer<typeof serviceTypeSchema>;
export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  training: 'Trainings / Briefings / Orientation',
  technical_assistance: 'Technical Assistance',
  iec_distribution: 'IEC Materials Distribution',
  others: 'Others',
};

export const ACTIVITY_STATUSES = ['active', 'archived'] as const;
export const activityStatusSchema = z.enum(ACTIVITY_STATUSES);
export type ActivityStatus = z.infer<typeof activityStatusSchema>;

/** Head-counts ONLY. No names are ever collected (RA 10173: collect the minimum). */
const count = z
  .number({ error: 'Enter a whole number.' })
  .int({ error: 'Enter a whole number.' })
  .min(0, { error: 'The number cannot be negative.' })
  .max(100000, { error: 'That number is too large.' });

export const attendanceRowSchema = z.object({
  participantTypeId: z.number().int().positive(),
  male: count,
  female: count,
});
export type AttendanceRow = z.infer<typeof attendanceRowSchema>;

const activityFields = z.object({
  serviceType: serviceTypeSchema,
  title: z
    .string({ error: 'Enter a title.' })
    .trim()
    .min(3, { error: 'Enter a title (at least 3 letters).' })
    .max(150, { error: 'The title is too long (150 characters max).' }),
  activityDate: pastOrToday,
  description: optionalText(2000, 'The description is too long (2000 characters max).'),
  scope: optionalText(300, 'The scope is too long (300 characters max).'),
  attendance: z
    .array(attendanceRowSchema)
    .max(50)
    .refine((rows) => new Set(rows.map((r) => r.participantTypeId)).size === rows.length, {
      error: 'Each participant type can appear only once.',
    }),
});

export const createActivitySchema = activityFields.extend({ confirmDuplicate: z.boolean().optional() });
export type CreateActivityInput = z.infer<typeof createActivitySchema>;
/** Editing sends the whole activity again (including its counts). */
export const updateActivitySchema = activityFields;
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;

export const setActivityStatusSchema = z.object({ status: activityStatusSchema });

export const ACTIVITY_SORTS = ['date_desc', 'date_asc'] as const;
export type ActivitySort = (typeof ACTIVITY_SORTS)[number];

export const listActivitiesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  serviceType: serviceTypeSchema.optional(),
  status: z.enum(['active', 'archived', 'all']).default('active'),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(ACTIVITY_SORTS).default('date_desc'),
});
export type ListActivitiesQuery = z.infer<typeof listActivitiesQuery>;

export const activityRecordSchema = z.object({
  id: z.string(),
  serviceType: serviceTypeSchema,
  title: z.string(),
  activityDate: z.string(),
  description: z.string().nullable(),
  scope: z.string().nullable(),
  status: activityStatusSchema,
  createdBy: z.string(),
  createdByName: z.string(),
  createdAt: z.string(),
  attendance: z.array(
    z.object({ participantTypeId: z.number(), participantTypeName: z.string(), male: z.number(), female: z.number() }),
  ),
  /** Worked out from the counts, never stored. */
  totals: z.object({ male: z.number(), female: z.number(), total: z.number() }),
});
export type ActivityRecord = z.infer<typeof activityRecordSchema>;
export const activityListSchema = z.object({
  records: z.array(activityRecordSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type ActivityList = z.infer<typeof activityListSchema>;

// ---------------- Operational issues (ATI Section E) ----------------
const issueFields = z.object({
  issueDate: pastOrToday,
  problem: z
    .string({ error: 'Describe the problem or difficulty.' })
    .trim()
    .min(3, { error: 'Describe the problem or difficulty (at least 3 letters).' })
    .max(1000, { error: 'Too long (1000 characters max).' }),
  actionTaken: optionalText(1000, 'Too long (1000 characters max).'),
  recommendation: optionalText(1000, 'Too long (1000 characters max).'),
  cropId: optionalUuid,
  activityId: optionalUuid,
});

export const createIssueSchema = issueFields.extend({ confirmDuplicate: z.boolean().optional() });
export type CreateIssueInput = z.infer<typeof createIssueSchema>;
export const updateIssueSchema = issueFields;
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;

export const listIssuesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  cropId: z.uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(ACTIVITY_SORTS).default('date_desc'),
});
export type ListIssuesQuery = z.infer<typeof listIssuesQuery>;

export const issueRecordSchema = z.object({
  id: z.string(),
  issueDate: z.string(),
  problem: z.string(),
  actionTaken: z.string().nullable(),
  recommendation: z.string().nullable(),
  cropId: z.string().nullable(),
  cropName: z.string().nullable(),
  activityId: z.string().nullable(),
  activityTitle: z.string().nullable(),
  createdBy: z.string(),
  createdByName: z.string(),
  createdAt: z.string(),
});
export type IssueRecord = z.infer<typeof issueRecordSchema>;
export const issueListSchema = z.object({
  records: z.array(issueRecordSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type IssueList = z.infer<typeof issueListSchema>;