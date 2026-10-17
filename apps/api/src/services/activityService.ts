import { z } from 'zod';
import { activityStatusSchema, serviceTypeSchema } from '@harvestgo/shared';
import type {
  ActivityList, ActivityRecord, ActivityStatus, CreateActivityInput, ListActivitiesQuery, UpdateActivityInput,
} from '@harvestgo/shared';
import type { AuthContext } from '../types.js';
import { withDateRange } from '../utils/cropCheck.js';
import { throwDbError } from '../utils/dbErrors.js';
import { oneOf, profileEmbed } from '../utils/embeds.js';
import { HttpError } from '../utils/errors.js';

// Pulls in the recorder's name and every head-count row (with the participant type's name) in one request.
const SELECT =
  'id, service_type, title, activity_date, description, scope, status, created_by, created_at, ' +
  'profiles(full_name), activity_attendance(participant_type_id, male_count, female_count, participant_types(name))';

const nameRow = z.object({ name: z.string() });
const attendanceRow = z.object({
  participant_type_id: z.number(),
  male_count: z.number(),
  female_count: z.number(),
  participant_types: z.union([nameRow, z.array(nameRow)]).nullable(),
});
const row = z.object({
  id: z.string(),
  service_type: serviceTypeSchema,
  title: z.string(),
  activity_date: z.string(),
  description: z.string().nullable(),
  scope: z.string().nullable(),
  status: activityStatusSchema,
  created_by: z.string(),
  created_at: z.string(),
  profiles: z.union([profileEmbed, z.array(profileEmbed)]).nullable(),
  activity_attendance: z.array(attendanceRow),
});

function toRecord(raw: unknown): ActivityRecord {
  const r = row.parse(raw);
  const attendance = r.activity_attendance
    .map((a) => ({
      participantTypeId: a.participant_type_id,
      participantTypeName: oneOf(a.participant_types)?.name ?? '',
      male: a.male_count,
      female: a.female_count,
    }))
    .sort((a, b) => a.participantTypeId - b.participantTypeId);
  const male = attendance.reduce((n, a) => n + a.male, 0);
  const female = attendance.reduce((n, a) => n + a.female, 0);
  return {
    id: r.id,
    serviceType: r.service_type,
    title: r.title,
    activityDate: r.activity_date,
    description: r.description,
    scope: r.scope,
    status: r.status,
    createdBy: r.created_by,
    createdByName: oneOf(r.profiles)?.full_name ?? '',
    createdAt: r.created_at,
    attendance,
    totals: { male, female, total: male + female }, // worked out here, never stored
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filtered<Q>(query: Q, f: ListActivitiesQuery): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = withDateRange(query, 'activity_date', f);
  if (f.serviceType) q = q.eq('service_type', f.serviceType);
  if (f.status !== 'all') q = q.eq('status', f.status);
  return q as Q;
}

export async function listActivities(actor: AuthContext, f: ListActivitiesQuery): Promise<ActivityList> {
  const start = (f.page - 1) * f.pageSize;
  const { data, count, error } = await filtered(actor.db.from('service_activities').select(SELECT, { count: 'exact' }), f)
    .order('activity_date', { ascending: f.sort === 'date_asc' })
    .order('created_at', { ascending: false })
    .range(start, start + f.pageSize - 1);

  if (error) {
    if (error.code === 'PGRST103') {
      const head = await filtered(actor.db.from('service_activities').select('id', { count: 'exact', head: true }), f);
      return { records: [], total: head.count ?? 0, page: f.page, pageSize: f.pageSize };
    }
    throwDbError(error, 'Activities');
  }
  return { records: (data ?? []).map(toRecord), total: count ?? 0, page: f.page, pageSize: f.pageSize };
}

export async function getActivity(actor: AuthContext, id: string): Promise<ActivityRecord> {
  const { data, error } = await actor.db.from('service_activities').select(SELECT).eq('id', id).maybeSingle();
  if (error) throwDbError(error, 'Activity');
  if (!data) throw new HttpError(404, 'NOT_FOUND', 'Activity not found.');
  return toRecord(data);
}

/** Staff may only change their own activities (the database enforces this too). */
async function loadOwned(actor: AuthContext, id: string) {
  const found = await actor.db.from('service_activities').select('id, created_by').eq('id', id).maybeSingle();
  if (found.error) throwDbError(found.error, 'Activity');
  if (!found.data) throw new HttpError(404, 'NOT_FOUND', 'Activity not found.');
  if (actor.role !== 'general_manager' && found.data.created_by !== actor.userId) {
    throw new HttpError(403, 'FORBIDDEN', 'You can only change activities you entered yourself.');
  }
}

/** Calls the all-or-nothing database function (migration 0003). */
async function saveAll(actor: AuthContext, id: string | null, input: UpdateActivityInput): Promise<string> {
  const { data, error } = await actor.db.rpc('save_service_activity', {
    p_id: id,
    p_service_type: input.serviceType,
    p_title: input.title,
    p_activity_date: input.activityDate,
    p_description: input.description,
    p_scope: input.scope,
    p_attendance: input.attendance,
  });
  if (error) {
    if (error.message.includes('ACTIVITY_NOT_FOUND_OR_FORBIDDEN')) {
      throw new HttpError(403, 'FORBIDDEN', 'You can only change activities you entered yourself.');
    }
    throwDbError(error, 'Activity');
  }
  return z.string().parse(data);
}

export async function createActivity(actor: AuthContext, input: CreateActivityInput): Promise<ActivityRecord> {
  if (!input.confirmDuplicate) {
    const dup = await actor.db
      .from('service_activities')
      .select('id')
      .eq('service_type', input.serviceType)
      .eq('activity_date', input.activityDate)
      .eq('title', input.title)
      .limit(1);
    if (dup.error) throwDbError(dup.error, 'Activities');
    if ((dup.data ?? []).length > 0) {
      throw new HttpError(409, 'DUPLICATE_SUSPECTED', 'An activity with the same title, type and date is already recorded.');
    }
  }
  const id = await saveAll(actor, null, input);
  return getActivity(actor, id);
}

export async function updateActivity(actor: AuthContext, id: string, input: UpdateActivityInput): Promise<ActivityRecord> {
  await loadOwned(actor, id);
  await saveAll(actor, id, input);
  return getActivity(actor, id);
}

/** Archive = hide from the main list but keep everything (reports still use it). */
export async function setActivityStatus(actor: AuthContext, id: string, status: ActivityStatus): Promise<ActivityRecord> {
  await loadOwned(actor, id);
  const { data, error } = await actor.db.from('service_activities').update({ status }).eq('id', id).select('id').maybeSingle();
  if (error) throwDbError(error, 'Activity');
  if (!data) throw new HttpError(403, 'FORBIDDEN', 'You can only change activities you entered yourself.');
  return getActivity(actor, id);
}

export async function deleteActivity(actor: AuthContext, id: string): Promise<void> {
  const { data, error } = await actor.db.from('service_activities').delete().eq('id', id).select('id');
  if (error) throwDbError(error, 'Activity');
  if (!data || data.length === 0) throw new HttpError(404, 'NOT_FOUND', 'Activity not found.');
}