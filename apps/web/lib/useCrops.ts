'use client';

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { cropCategorySchema, cropSchema, type Crop, type CropCategory } from '@harvestgo/shared';
import { apiFetch } from './api';

type State<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; items: T[] };

function useList<T>(path: string, key: string, schema: z.ZodType<T>) {
  const [state, setState] = useState<State<T>>({ status: 'loading' });
  const reload = useCallback(async () => {
    try {
      const data = await apiFetch<Record<string, unknown>>(path);
      setState({ status: 'ready', items: z.array(schema).parse(data[key]) });
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not load the list.' });
    }
  }, [path, key, schema]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { state, reload };
}

/** The crop list (for dropdowns). Pass true to include switched-off crops too. */
export function useCrops(includeInactive = false) {
  return useList<Crop>(`/crops?includeInactive=${includeInactive}`, 'crops', cropSchema);
}

export function useCategories() {
  return useList<CropCategory>('/crop-categories', 'categories', cropCategorySchema);
}