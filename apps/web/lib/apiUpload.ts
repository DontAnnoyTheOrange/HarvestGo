import { CSRF_HEADER, CSRF_VALUE, apiErrorSchema } from '@harvestgo/shared';
import { ApiRequestError } from './api';

/**
 * Sends a file (multipart form). Same safety header and error handling as apiFetch.
 * The browser adds the right Content-Type (with the boundary) by itself, so we do not set it.
 */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { [CSRF_HEADER]: CSRF_VALUE },
      body: form,
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK', 'Cannot reach the server. Check your internet connection and try again.');
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