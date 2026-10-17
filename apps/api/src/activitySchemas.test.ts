import { describe, expect, it } from 'vitest';
import { createActivitySchema, createIssueSchema, updateActivitySchema } from '@harvestgo/shared';

const activity = {
  serviceType: 'training',
  title: 'Mushroom Cultivation Seminar',
  activityDate: '2026-06-21',
  attendance: [{ participantTypeId: 1, male: 10, female: 30 }],
};
const issue = { issueDate: '2026-06-21', problem: 'Keeping accurate records of all harvest' };

describe('activity rules', () => {
  it('accepts the ATI sample activity and turns blanks into null', () => {
    const r = createActivitySchema.safeParse({ ...activity, description: '  ', scope: undefined });
    expect(r.success && r.data.description === null && r.data.scope === null).toBe(true);
  });

  it('accepts an activity with no head-counts yet', () => {
    expect(createActivitySchema.safeParse({ ...activity, attendance: [] }).success).toBe(true);
  });

  it.each([
    ['unknown service type', { serviceType: 'party' }],
    ['short title', { title: 'ab' }],
    ['future date', { activityDate: '2999-01-01' }],
    ['impossible date', { activityDate: '2026-02-30' }],
    ['negative count', { attendance: [{ participantTypeId: 1, male: -1, female: 0 }] }],
    ['decimal count', { attendance: [{ participantTypeId: 1, male: 1.5, female: 0 }] }],
    ['not a number', { attendance: [{ participantTypeId: 1, male: Number.NaN, female: 0 }] }],
    ['huge count', { attendance: [{ participantTypeId: 1, male: 1_000_000, female: 0 }] }],
    ['same participant type twice', { attendance: [{ participantTypeId: 1, male: 1, female: 1 }, { participantTypeId: 1, male: 2, female: 2 }] }],
  ])('rejects %s', (_label, bad) => {
    expect(createActivitySchema.safeParse({ ...activity, ...bad }).success).toBe(false);
  });

  it('never accepts participant names (unknown keys are dropped, not stored)', () => {
    const r = createActivitySchema.safeParse({
      ...activity,
      attendance: [{ participantTypeId: 1, male: 1, female: 1, name: 'Juan Dela Cruz' }],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.attendance[0]).toEqual({ participantTypeId: 1, male: 1, female: 1 });
  });

  it('edit needs the whole activity', () => {
    expect(updateActivitySchema.safeParse({ title: 'Only a title' }).success).toBe(false);
    expect(updateActivitySchema.safeParse(activity).success).toBe(true);
  });
});

describe('issue rules', () => {
  it('accepts the sample issue; optional parts become null', () => {
    const r = createIssueSchema.safeParse({ ...issue, actionTaken: 'Orientation of staff', cropId: '' });
    expect(r.success).toBe(false); // an empty crop id is not a valid id (the screen sends null instead)
    const ok = createIssueSchema.safeParse({ ...issue, actionTaken: 'Orientation of staff', cropId: null });
    expect(ok.success && ok.data.recommendation === null && ok.data.cropId === null).toBe(true);
  });
  it.each([
    ['short problem', { problem: 'x' }],
    ['future date', { issueDate: '2999-01-01' }],
    ['bad crop id', { cropId: 'mushroom' }],
    ['too long', { recommendation: 'x'.repeat(1001) }],
  ])('rejects %s', (_l, bad) => expect(createIssueSchema.safeParse({ ...issue, ...bad }).success).toBe(false));
});