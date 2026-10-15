import { z } from 'zod';
import { roleSchema } from '@harvestgo/shared';
import { createAnonClient, createUserClient } from '../supabase.js';
import { ServiceUnavailableError } from '../utils/errors.js';
import type { AuthContext } from '../types.js';
import type { TokenPair } from '../utils/cookies.js';

const profileRowSchema = z.object({
  id: z.string(),
  full_name: z.string(),
  role: roleSchema,
  is_active: z.boolean(),
});

/** Checks email + password with Supabase Auth (which stores them hashed with bcrypt). */
export async function signIn(email: string, password: string) {
  const { data, error } = await createAnonClient().auth.signInWithPassword({ email, password });
  if (error) {
    // 400/401/422 = Supabase refused the login (wrong password, unconfirmed email...).
    if (error.status === 400 || error.status === 401 || error.status === 422) {
      console.warn(`[auth] sign-in refused: ${error.code ?? error.message}`); // never logs the password
      return null;
    }
    console.error('[auth] Supabase problem:', error.status, error.code, error.message);
    throw new ServiceUnavailableError(`Supabase Auth problem: ${error.status} ${error.message}`);
  }
  if (!data.session || !data.user) return null;
  return { session: data.session as TokenPair & { access_token: string }, user: data.user };
}

/** Looks up the person's own profile AS themselves. Disabled accounts see nothing (database rule). */
async function loadProfile(accessToken: string, userId: string) {
  const db = createUserClient(accessToken);
  const { data, error } = await db
    .from('profiles')
    .select('id, full_name, role, is_active')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  const parsed = profileRowSchema.safeParse(data);
  if (!parsed.success || !parsed.data.is_active) return null;
  return { db, profile: parsed.data };
}

/** Turns a token into "who is this and what may they do", or null. */
export async function resolveSession(accessToken: string): Promise<AuthContext | null> {
  const { data, error } = await createAnonClient().auth.getUser(accessToken);
  if (error || !data.user) return null;
  const loaded = await loadProfile(accessToken, data.user.id);
  if (!loaded) return null;
  return {
    userId: data.user.id,
    email: data.user.email ?? '',
    fullName: loaded.profile.full_name,
    role: loaded.profile.role,
    accessToken,
    db: loaded.db,
  };
}

/** Same as resolveSession, right after login (the token is brand new). */
export const resolveAfterLogin = resolveSession;

/** Swaps a refresh token for a fresh pair. */
export async function refreshSession(refreshToken: string): Promise<TokenPair | null> {
  const { data, error } = await createAnonClient().auth.refreshSession({
    refresh_token: refreshToken,
  });
  if (error || !data.session) return null;
  return data.session as TokenPair;
}
