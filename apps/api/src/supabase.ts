import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

const baseOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

/** A client with NO user attached. Used only for signing in and checking tokens. */
export function createAnonClient(): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, baseOptions);
}

/**
 * A client that acts AS the logged-in person. Because it carries their token,
 * the database's security rules (RLS) are applied to everything it does.
 */
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    ...baseOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Tells Supabase to end this login. Best effort: logging out still works if it fails. */
export async function revokeSession(accessToken: string): Promise<void> {
  try {
    await fetch(`${env.SUPABASE_URL}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    /* ignore */
  }
}
