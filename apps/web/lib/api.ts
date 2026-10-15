import { CSRF_HEADER, CSRF_VALUE, apiErrorSchema } from '@harvestgo/shared';

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

/** The ONE place the website talks to the server. Adds the safety header, reads errors. */
export async function apiFetch<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; json?: unknown } = {},
): Promise<T> {
  const { method = 'GET', json } = options;
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        [CSRF_HEADER]: CSRF_VALUE,
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK', 'Cannot reach the server. Check your internet connection.');
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(data);
    throw new ApiRequestError(
      res.status,
      parsed.success ? parsed.data.error.code : 'UNKNOWN',
      parsed.success ? parsed.data.error.message : 'Something went wrong. Please try again.',
      parsed.success ? parsed.data.error.details : undefined,
    );
  }
  return data as T;
}
