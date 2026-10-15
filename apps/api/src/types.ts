import type { SupabaseClient } from '@supabase/supabase-js';
import type { Role } from '@harvestgo/shared';

/** Everything we know about the logged-in person during one request. */
export interface AuthContext {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  accessToken: string;
  /** Database client that acts as this person (database rules apply). */
  db: SupabaseClient;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
