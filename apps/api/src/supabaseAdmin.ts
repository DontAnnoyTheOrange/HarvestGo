import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';
import { ServiceUnavailableError } from './utils/errors.js';

let client: SupabaseClient | null = null;

/**
 * THE ONLY PLACE THE SECRET (service role) KEY IS USED.
 * This client skips the database's security rules, so it is only for jobs that
 * ordinary users can never do themselves: creating logins and resetting passwords.
 * Only code behind the General Manager guard may call it.
 */
export function getAdminClient(): SupabaseClient {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ServiceUnavailableError('SUPABASE_SERVICE_ROLE_KEY is missing from .env');
  }
  client ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
