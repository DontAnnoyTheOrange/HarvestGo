import { z } from 'zod';
import {
  roleSchema,
  type CreateUserInput,
  type ManagedUser,
  type ResetPasswordInput,
  type UpdateUserInput,
} from '@harvestgo/shared';
import { getAdminClient } from '../supabaseAdmin.js';
import type { AuthContext } from '../types.js';
import { HttpError, ServiceUnavailableError } from '../utils/errors.js';

const profileRow = z.object({
  id: z.string(),
  full_name: z.string(),
  role: roleSchema,
  is_active: z.boolean(),
});
const toManaged = (p: z.infer<typeof profileRow>, email: string): ManagedUser => ({
  id: p.id,
  email,
  fullName: p.full_name,
  role: p.role,
  isActive: p.is_active,
});

/** Everyone, including disabled accounts. Names come from the database (as the manager), emails from Supabase Auth. */
export async function listUsers(actor: AuthContext): Promise<ManagedUser[]> {
  const { data, error } = await actor.db
    .from('profiles')
    .select('id, full_name, role, is_active')
    .order('full_name');
  if (error) throw new ServiceUnavailableError(`profiles read failed: ${error.message}`);

  const admin = getAdminClient();
  const { data: authData, error: authErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (authErr) throw new ServiceUnavailableError(`auth list failed: ${authErr.message}`);
  const emails = new Map(authData.users.map((u) => [u.id, u.email ?? '']));

  return z
    .array(profileRow)
    .parse(data)
    .map((p) => toManaged(p, emails.get(p.id) ?? ''));
}

/** Creates the login AND the profile. If the second step fails, the first is undone. */
export async function createUser(input: CreateUserInput): Promise<ManagedUser> {
  const admin = getAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true, // the manager vouches for this address; no email is sent
  });
  if (error || !data.user) {
    if (error?.code === 'email_exists' || error?.code === 'user_already_exists') {
      throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.', {
        email: ['This email is already used.'],
      });
    }
    if (error?.code === 'weak_password') {
      throw new HttpError(400, 'WEAK_PASSWORD', 'That password is too easy to guess.', {
        password: ['Choose a stronger password.'],
      });
    }
    console.error('[users] createUser failed:', error?.status, error?.code, error?.message);
    throw new ServiceUnavailableError(`createUser failed: ${error?.status} ${error?.message}`);
  }

  const { error: profileErr } = await admin
    .from('profiles')
    .insert({ id: data.user.id, full_name: input.fullName, role: input.role });
  if (profileErr) {
    await admin.auth.admin.deleteUser(data.user.id); // undo, so no half-made account is left behind
    console.error('[users] profile insert failed:', profileErr.message);
    throw new ServiceUnavailableError(`profile insert failed: ${profileErr.message}`);
  }

  return { id: data.user.id, email: input.email, fullName: input.fullName, role: input.role, isActive: true };
}

/** Change name, role, or switch an account on/off. */
export async function updateUser(actor: AuthContext, id: string, patch: UpdateUserInput): Promise<ManagedUser> {
  // Friendly version of a rule the database also enforces: you cannot lock yourself out.
  if (id === actor.userId && ((patch.role && patch.role !== 'general_manager') || patch.isActive === false)) {
    throw new HttpError(409, 'SELF_PROTECTED', 'You cannot demote or disable your own account.');
  }

  const row: Record<string, unknown> = {};
  if (patch.fullName !== undefined) row.full_name = patch.fullName;
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;

  const { data, error } = await actor.db
    .from('profiles')
    .update(row)
    .eq('id', id)
    .select('id, full_name, role, is_active')
    .maybeSingle();
  if (error) throw new ServiceUnavailableError(`profile update failed: ${error.message}`);
  if (!data) throw new HttpError(404, 'NOT_FOUND', 'User not found.');

  const { data: authUser } = await getAdminClient().auth.admin.getUserById(id);
  return toManaged(profileRow.parse(data), authUser?.user?.email ?? '');
}

/** The manager sets a new password for someone (also used when a password is forgotten). */
export async function resetPassword(id: string, input: ResetPasswordInput): Promise<void> {
  const { error } = await getAdminClient().auth.admin.updateUserById(id, { password: input.password });
  if (!error) return;
  if (error.code === 'user_not_found') throw new HttpError(404, 'NOT_FOUND', 'User not found.');
  if (error.code === 'weak_password') {
    throw new HttpError(400, 'WEAK_PASSWORD', 'That password is too easy to guess.', {
      password: ['Choose a stronger password.'],
    });
  }
  console.error('[users] resetPassword failed:', error.status, error.code, error.message);
  throw new ServiceUnavailableError(`resetPassword failed: ${error.status} ${error.message}`);
}
