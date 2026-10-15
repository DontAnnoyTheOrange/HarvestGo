import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Load the .env file that sits in the project's root folder.
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../../.env'), quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  SUPABASE_URL: z.url({ error: 'SUPABASE_URL must be the Project URL, e.g. https://xxxx.supabase.co' }),
  SUPABASE_ANON_KEY: z.string().min(20, { error: 'SUPABASE_ANON_KEY is missing or too short' }),
  // Not used yet. Only the user-management step will read it. Optional until then.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('\nYour .env file has a problem:');
  for (const [field, msgs] of Object.entries(z.flattenError(parsed.error).fieldErrors)) {
    console.error(`  - ${field}: ${(msgs as string[]).join(', ')}`);
  }
  console.error('\nOpen the .env file in the project root and fix the lines above.\n');
  process.exit(1);
}
export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
