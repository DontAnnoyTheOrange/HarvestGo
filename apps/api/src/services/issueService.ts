import { z } from 'zod';
import type { CreateIssueInput, IssueList, IssueRecord, ListIssuesQuery, UpdateIssueInput } from '@harvestgo/shared';
import type { AuthContext } from '../types.js';
import { assertCropUsable, withDateRange } from '../utils/cropCheck.js';
import { throwDbError } from '../utils/dbErrors.js';
import { oneOf, profileEmbed } from '../utils/embeds.js';
import { HttpError } from '../utils/errors.js';

const SELECT =
  'id, issue_date, problem, action_taken, recommendation, crop_id, activity_id, created_by, created_at, ' +
  'crops(name), service_activities(title), profiles(full_name)';

const cropName = z.object({ name: z.string() });
const activityTitle = z.object({ title: z.string() });
const row = z.object({
  id: z.string(),
  issue_date: z.string(),
  problem: z.string(),
  action_taken: z.string().nullable(),
  recommendation: z.string().nullable(),
  crop_id: z.string().nullable(),
  activity_id: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
  crops: z.union([cropName, z.array(cropName)]).nullable(),
  service_activities: z.union([activityTitle, z.array(activityTitle)]).nullable(),
  profiles: z.union([profileEmbed, z.array(profileEmbed)]).nullable(),
});

function toRecord(raw: unknown): IssueRecord {
  const r = row.parse(raw);
  return {
    id: r.id,
    issueDate: r.issue_date,
    problem: r.problem,
    actionTaken: r.action_taken,
    recommendation: r.recommendation,
    cropId: r.crop_id,
    cropName: oneOf(r.crops)?.name ?? null,
    activityId: r.activity_id,
    activityTitle: oneOf(r.service_activities)?.title ?? null,
    createdBy: r.created_by,
    createdByName: oneOf(r.profiles)?.full_name ?? '',
    createdAt: r.created_at,
  };
}

export async function listIssues(actor: AuthContext, f: ListIssuesQuery): Promise<IssueList> {
  const start = (f.page - 1) * f.pageSize;
  const { data, count, error } = await withDateRange(
    actor.db.from('operational_issues').select(SELECT, { count: 'exact' }),
    'issue_date',
    f,
  )
    .order('issue_date', { ascending: f.sort === 'date_asc' })
    .order('created_at', { ascending: false })
    .range(start, start + f.pageSize - 1);

  if (error) {
    if (error.code === 'PGRST103') {
      const head = await withDateRange(actor.db.from('operational_issues').select('id', { count: 'exact', head: true }), 'issue_date', f);
      return { records: [], total: head.count ?? 0, page: f.page, pageSize: f.pageSize };
    }
    throwDbError(error, 'Issues');
  }
  return { records: (data ?? []).map(toRecord), total: count ?? 0, page: f.page, pageSize: f.pageSize };
}

export async function createIssue(actor: AuthContext, input: CreateIssueInput): Promise<IssueRecord> {
  if (input.cropId) await assertCropUsable(actor, input.cropId);

  if (!input.confirmDuplicate) {
    const dup = await actor.db
      .from('operational_issues')
      .select('id')
      .eq('issue_date', input.issueDate)
      .eq('problem', input.problem)
      .limit(1);
    if (dup.error) throwDbError(dup.error, 'Issues');
    if ((dup.data ?? []).length > 0) {
      throw new HttpError(409, 'DUPLICATE_SUSPECTED', 'An issue with the same date and description is already recorded.');
    }
  }

  const { data, error } = await actor.db
    .from('operational_issues')
    .insert({
      issue_date: input.issueDate,
      problem: input.problem,
      action_taken: input.actionTaken,
      recommendation: input.recommendation,
      crop_id: input.cropId,
      activity_id: input.activityId,
      created_by: actor.userId, // always the real logged-in person
    })
    .select(SELECT)
    .single();
  if (error) throwDbError(error, 'Issue');
  return toRecord(data);
}

export async function updateIssue(actor: AuthContext, id: string, input: UpdateIssueInput): Promise<IssueRecord> {
  const found = await actor.db.from('operational_issues').select('id, created_by, crop_id').eq('id', id).maybeSingle();
  if (found.error) throwDbError(found.error, 'Issue');
  if (!found.data) throw new HttpError(404, 'NOT_FOUND', 'Issue not found.');
  if (actor.role !== 'general_manager' && found.data.created_by !== actor.userId) {
    throw new HttpError(403, 'FORBIDDEN', 'You can only edit records you entered yourself.');
  }
  if (input.cropId && input.cropId !== found.data.crop_id) await assertCropUsable(actor, input.cropId);

  const { data, error } = await actor.db
    .from('operational_issues')
    .update({
      issue_date: input.issueDate,
      problem: input.problem,
      action_taken: input.actionTaken,
      recommendation: input.recommendation,
      crop_id: input.cropId,
      activity_id: input.activityId,
    })
    .eq('id', id)
    .select(SELECT)
    .maybeSingle();
  if (error) throwDbError(error, 'Issue');
  if (!data) throw new HttpError(403, 'FORBIDDEN', 'You can only edit records you entered yourself.');
  return toRecord(data);
}

export async function deleteIssue(actor: AuthContext, id: string): Promise<void> {
  const { data, error } = await actor.db.from('operational_issues').delete().eq('id', id).select('id');
  if (error) throwDbError(error, 'Issue');
  if (!data || data.length === 0) throw new HttpError(404, 'NOT_FOUND', 'Issue not found.');
}