import { defineConfig } from 'vitest/config';

// Fake settings so tests never touch your real .env or the real Supabase.
export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      SUPABASE_URL: 'https://fake-project.supabase.co',
      SUPABASE_ANON_KEY: 'fake-anon-key-for-tests-only-0000',
    },
  },
});
