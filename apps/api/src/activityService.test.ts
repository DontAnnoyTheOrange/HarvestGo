import { describe, expect, it, vi } from 'vitest';
import type { UpdateActivityInput } from '@harvestgo/shared';
import { createActivity, deleteActivity, setActivityStatus, updateActivity } from './services/activityService.js';
import { createIssue, deleteIssue, updateIssue } from './services/issueService.js';

/** A pretend database call: any chain of .select().eq()... finally resolves to `result`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chain(result: unknown): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = new Proxy({}, { get: (_t, prop) => (prop === 'then' ? (res: (v: unknown) => void) => res(result) : () => c) });
  return c;
}
function fakeDb(answers: unknown[], rpcAnswer?: unknown) {
  const from = vi.fn();
  for (const a of answers) from.mockReturnValueOnce(chain(a));
  return { from, rpc: vi.fn().mockResolvedValue(rpcAnswer ?? { data: null, error: null }) };
}
const actor = (role: string, userId: string, db: unknown) => ({ userId, role, db }) as never;

const actId = '9b1c2d3e-6a52-4b52-9a4e-1c2d3e4f5a6b';
const input: UpdateActivityInput = {
  serviceType: 'training', title: 'Mushroom Cultivation Seminar', activityDate: '2026-06-21', description: null, scope: null,
  attendance: [{ participantTypeId: 1, male: 10, female: 30 }, { participantTypeId: 2, male: 7, female: 14 }],
};
const activityRow = {
  id: actId, service_type: 'training', title: 'Mushroom Cultivation Seminar', activity_date: '2026-06-21', description: null, scope: null,
  status: 'active', created_by: 'u1', created_at: '2026-06-21T00:00:00Z', profiles: { full_name: 'Staff Bee' },
  activity_attendance: [
    { participant_type_id: 2, male_count: 7, female_count: 14, participant_types: { name: 'Farm Youth' } },
    { participant_type_id: 1, male_count: 10, female_count: 30, participant_types: { name: 'Farmers' } },
  ],
};

describe('createActivity', () => {
  it('warns about a likely duplicate and does not call the save function', async () => {
    const db = fakeDb([{ data: [{ id: 'old' }], error: null }]);
    await expect(createActivity(actor('administrative_staff', 'u1', db), input)).rejects.toMatchObject({ status: 409, code: 'DUPLICATE_SUSPECTED' });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('saves everything with ONE call to the all-or-nothing function and adds up the totals', async () => {
    const db = fakeDb([{ data: [], error: null }, { data: activityRow, error: null }], { data: actId, error: null });
    const rec = await createActivity(actor('administrative_staff', 'u1', db), input);
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith('save_service_activity', expect.objectContaining({
      p_id: null, p_service_type: 'training', p_title: 'Mushroom Cultivation Seminar', p_attendance: input.attendance,
    }));
    expect(rec.totals).toEqual({ male: 17, female: 44, total: 61 }); // the ATI sample numbers
    expect(rec.attendance.map((a) => a.participantTypeName)).toEqual(['Farmers', 'Farm Youth']); // sorted
  });

  it('turns a database "bad reference" into a clear 400', async () => {
    const db = fakeDb([{ data: [], error: null }], { data: null, error: { code: '23503', message: 'fk' } });
    await expect(createActivity(actor('administrative_staff', 'u1', db), { ...input, confirmDuplicate: true })).rejects.toMatchObject({ status: 400 });
  });

  it('turns "forbidden" from the database function into 403', async () => {
    const db = fakeDb([{ data: { id: actId, created_by: 'other' }, error: null }], { data: null, error: { code: 'P0001', message: 'ACTIVITY_NOT_FOUND_OR_FORBIDDEN' } });
    await expect(updateActivity(actor('general_manager', 'gm', db), actId, input)).rejects.toMatchObject({ status: 403 });
  });
});

describe('updateActivity / setActivityStatus / deleteActivity', () => {
  it("stops Staff from changing someone else's activity before saving anything", async () => {
    const db = fakeDb([{ data: { id: actId, created_by: 'other' }, error: null }]);
    await expect(updateActivity(actor('administrative_staff', 'u1', db), actId, input)).rejects.toMatchObject({ status: 403 });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('404 when the activity does not exist', async () => {
    const db = fakeDb([{ data: null, error: null }]);
    await expect(updateActivity(actor('general_manager', 'gm', db), actId, input)).rejects.toMatchObject({ status: 404 });
  });

  it('lets Staff edit their own and the Manager edit anyone', async () => {
    const mine = fakeDb([{ data: { id: actId, created_by: 'u1' }, error: null }, { data: activityRow, error: null }], { data: actId, error: null });
    await expect(updateActivity(actor('administrative_staff', 'u1', mine), actId, input)).resolves.toBeDefined();
    const manager = fakeDb([{ data: { id: actId, created_by: 'other' }, error: null }, { data: activityRow, error: null }], { data: actId, error: null });
    await expect(updateActivity(actor('general_manager', 'gm', manager), actId, input)).resolves.toBeDefined();
  });

  it('archives your own activity, and reports 403 if the database rules block it', async () => {
    const ok = fakeDb([{ data: { id: actId, created_by: 'u1' }, error: null }, { data: { id: actId }, error: null }, { data: { ...activityRow, status: 'archived' }, error: null }]);
    expect((await setActivityStatus(actor('administrative_staff', 'u1', ok), actId, 'archived')).status).toBe('archived');
    const blocked = fakeDb([{ data: { id: actId, created_by: 'u1' }, error: null }, { data: null, error: null }]);
    await expect(setActivityStatus(actor('administrative_staff', 'u1', blocked), actId, 'archived')).rejects.toMatchObject({ status: 403 });
  });

  it('delete: 404 if nothing was removed', async () => {
    await expect(deleteActivity(actor('general_manager', 'gm', fakeDb([{ data: [], error: null }])), actId)).rejects.toMatchObject({ status: 404 });
    await expect(deleteActivity(actor('general_manager', 'gm', fakeDb([{ data: [{ id: actId }], error: null }])), actId)).resolves.toBeUndefined();
  });
});

describe('issues', () => {
  const crop = '3f2a4d3e-6a52-4b52-9a4e-1c2d3e4f5a6b';
  const issueIn = { issueDate: '2026-06-21', problem: 'Keeping accurate records', actionTaken: 'Orientation of staff', recommendation: null, cropId: null, activityId: null };
  const issueRow = {
    id: 'i1', issue_date: '2026-06-21', problem: 'Keeping accurate records', action_taken: 'Orientation of staff', recommendation: null,
    crop_id: null, activity_id: null, created_by: 'u1', created_at: '2026-06-21T00:00:00Z', crops: null, service_activities: null, profiles: { full_name: 'Staff Bee' },
  };

  it('warns about a duplicate, then saves when confirmed', async () => {
    await expect(createIssue(actor('administrative_staff', 'u1', fakeDb([{ data: [{ id: 'old' }], error: null }])), issueIn)).rejects.toMatchObject({ status: 409 });
    const rec = await createIssue(actor('administrative_staff', 'u1', fakeDb([{ data: issueRow, error: null }])), { ...issueIn, confirmDuplicate: true });
    expect(rec).toMatchObject({ problem: 'Keeping accurate records', cropName: null, activityTitle: null, createdByName: 'Staff Bee' });
  });

  it('refuses a switched-off crop', async () => {
    const db = fakeDb([{ data: { id: crop, is_active: false }, error: null }]);
    await expect(createIssue(actor('administrative_staff', 'u1', db), { ...issueIn, cropId: crop })).rejects.toMatchObject({ status: 400 });
  });

  it("stops Staff editing someone else's issue", async () => {
    const db = fakeDb([{ data: { id: 'i1', created_by: 'other', crop_id: null }, error: null }]);
    await expect(updateIssue(actor('administrative_staff', 'u1', db), 'i1', issueIn)).rejects.toMatchObject({ status: 403 });
  });

  it('delete: 404 if nothing was removed', async () => {
    await expect(deleteIssue(actor('general_manager', 'gm', fakeDb([{ data: [], error: null }])), 'i1')).rejects.toMatchObject({ status: 404 });
  });
});