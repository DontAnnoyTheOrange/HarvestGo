import { beforeEach, describe, expect, it, vi } from 'vitest';

const signInWithPassword = vi.hoisted(() => vi.fn());
vi.mock('./supabase.js', () => ({
  createAnonClient: () => ({ auth: { signInWithPassword } }),
  createUserClient: vi.fn(),
}));

import { signIn } from './services/authService.js';
import { ServiceUnavailableError } from './utils/errors.js';

beforeEach(() => vi.clearAllMocks());

describe('signIn', () => {
  it('returns null when Supabase refuses the login (wrong password)', async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: { status: 400, code: 'invalid_credentials', message: 'x' } });
    expect(await signIn('a@b.ph', 'bad')).toBeNull();
  });

  it('throws "unavailable" when Supabase cannot be reached, instead of blaming the password', async () => {
    signInWithPassword.mockResolvedValue({ data: {}, error: { status: 0, message: 'fetch failed' } });
    await expect(signIn('a@b.ph', 'x')).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('returns the session on success', async () => {
    const session = { access_token: 'a', refresh_token: 'r', expires_in: 3600 };
    signInWithPassword.mockResolvedValue({ data: { session, user: { id: 'u' } }, error: null });
    expect((await signIn('a@b.ph', 'ok'))?.session).toEqual(session);
  });
});
