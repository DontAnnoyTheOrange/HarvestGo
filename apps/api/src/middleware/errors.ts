import type { ErrorRequestHandler, RequestHandler } from 'express';
import { HttpError, ServiceUnavailableError } from '../utils/errors.js';
import { sendError } from '../utils/http.js';

// Every error leaves the server in the same shape: { error: { code, message } }
export const notFound: RequestHandler = (_req, res) => {
  sendError(res, 404, 'NOT_FOUND', 'That address does not exist.');
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    // The technical reason goes to the server log, never to the person.
    if (err.status >= 500) {
      console.error(err instanceof ServiceUnavailableError ? `[unavailable] ${err.internal}` : err);
    }
    sendError(res, err.status, err.code, err.message, err.details);
    return;
  }
  const status =
    typeof err?.status === 'number' && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error(err);
  if (status === 500) {
    sendError(res, 500, 'INTERNAL', 'Something went wrong on our side.');
  } else {
    sendError(res, status, 'BAD_REQUEST', 'The request could not be understood.');
  }
};
