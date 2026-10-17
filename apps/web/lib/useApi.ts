'use client';

import { useCallback, useEffect, useState } from 'react';
import type { z } from 'zod';
import { apiFetch } from './api';

export type ApiState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

/** Loads one address and checks the answer's shape. Pass null to wait. */
export function useApi<T>(path: string | null, schema: z.ZodType<T>) {
  const [state, setState] = useState<ApiState<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    setState({ status: 'loading' });
    apiFetch<unknown>(path)
      .then((raw) => {
        if (!cancelled) setState({ status: 'ready', data: schema.parse(raw) });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not load this.' });
      });
    return () => {
      cancelled = true;
    };
  }, [path, schema, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { state, reload };
}