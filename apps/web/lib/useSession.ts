'use client';

import { useCallback, useEffect, useState } from 'react';
import { sessionUserSchema, type SessionUser } from '@harvestgo/shared';
import { ApiRequestError, apiFetch } from './api';

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'error'; message: string }
  | { status: 'authenticated'; user: SessionUser };

/** Asks the server "who am I?". The server's answer is the truth; the screen just shows it. */
export function useSession() {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const data = await apiFetch<{ user: unknown }>('/auth/me');
      const user = sessionUserSchema.safeParse(data.user);
      setState(user.success ? { status: 'authenticated', user: user.data } : { status: 'error', message: 'Unexpected answer from the server.' });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) setState({ status: 'anonymous' });
      else setState({ status: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: load };
}
