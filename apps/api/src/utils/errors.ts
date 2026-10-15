/** An error we expect and can explain to the person (wrong input, not found, not allowed...). */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

/** Supabase is unreachable or misconfigured (not the person's fault). */
export class ServiceUnavailableError extends HttpError {
  constructor(public internal = 'A required service is unavailable.') {
    super(503, 'SERVICE_UNAVAILABLE', 'The system is temporarily unavailable. Please try again soon.');
  }
}
