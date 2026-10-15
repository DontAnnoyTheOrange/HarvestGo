import type { RequestHandler } from 'express';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@harvestgo/shared';
import { refreshSession, resolveSession } from '../services/authService.js';
import { clearSessionCookies, setSessionCookies } from '../utils/cookies.js';
import { sendError } from '../utils/http.js';

/** Guard 1: "Are you logged in?" Renews an expired login quietly if it can. */
export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const access = req.cookies?.[ACCESS_COOKIE] as string | undefined;
    let ctx = access ? await resolveSession(access) : null;

    if (!ctx) {
      const refresh = req.cookies?.[REFRESH_COOKIE] as string | undefined;
      if (refresh) {
        const renewed = await refreshSession(refresh);
        if (renewed) {
          setSessionCookies(res, renewed);
          ctx = await resolveSession(renewed.access_token);
        }
      }
    }

    if (!ctx) {
      clearSessionCookies(res);
      return sendError(res, 401, 'UNAUTHENTICATED', 'Please log in.');
    }
    req.auth = ctx;
    return next();
  } catch (err) {
    return next(err);
  }
};
