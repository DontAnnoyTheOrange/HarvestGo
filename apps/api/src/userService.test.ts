import { beforeEach, describe, expect, it, vi } from 'vitest';

const admin = vi.hoisted(() => ({
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  insert: vi.fn(),
}));
vi.mock('./supabaseAdmin.js', () => ({
  getAdminClient: () => ({
    auth: { admin: { createUser: admin.createUser, deleteUser: admin.deleteUser } },
    from: () => ({ insert: admin.insert }),
  }),
}));

import { createUser, updateUser } from './services/userService.js';
import { HttpError, ServiceUnavailableError } from './utils/errors.js';

const input = { fullName: 'Staff Bee', email: 'bee@farm.ph', role: 'administrative_staff', password: 'Harvest2026ok' } as const;
beforeEach(() => vi.clearAllMocks());

describe('createUser', () => {
  it('creates a confirmed login, then its profile', async () => {
    admin.createUser.mockResolvedValue({ data: { user: { id: 'new-id' } }, error: null });
    admin.insert.mockResolvedValue({ error: null });
    const user = await createUser(input);
    expect(admin.createUser).toHaveBeenCalledWith({ email: 'bee@farm.ph', password: 'Harvest2026ok', email_confirm: true });
    expect(admin.insert).toHaveBeenCalledWith({ id: 'new-id', full_name: 'Staff Bee', role: 'administrative_staff' });
    expect(user).toEqual({ id: 'new-id', email: 'bee@farm.ph', fullName: 'Staff Bee', role: 'administrative_staff', isActive: true });
  });

  it('reports a duplicate email and creates no profile', async () => {
    admin.createUser.mockResolvedValue({ data: { user: null }, error: { status: 422, code: 'email_exists', message: 'x' } });
    await expect(createUser(input)).rejects.toMatchObject({ status: 409, code: 'EMAIL_TAKEN' });
    expect(admin.insert).not.toHaveBeenCalled();
  });

  it('UNDOES the login if the profile cannot be saved (no half-made accounts)', async () => {
    admin.createUser.mockResolvedValue({ data: { user: { id: 'new-id' } }, error: null });
    admin.insert.mockResolvedValue({ error: { message: 'boom' } });
    await expect(createUser(input)).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(admin.deleteUser).toHaveBeenCalledWith('new-id');
  });
});

describe('updateUser self-protection', () => {
  const me = { userId: 'me', role: 'general_manager', db: { from: vi.fn() } } as never;

  it('stops a manager from demoting themselves, before touching the database', async () => {
    await expect(updateUser(me, 'me', { role: 'administrative_staff' })).rejects.toMatchObject({ status: 409, code: 'SELF_PROTECTED' });
    expect((me as { db: { from: ReturnType<typeof vi.fn> } }).db.from).not.toHaveBeenCalled();
  });

  it('stops a manager from disabling themselves', async () => {
    await expect(updateUser(me, 'me', { isActive: false })).rejects.toBeInstanceOf(HttpError);
  });
});
