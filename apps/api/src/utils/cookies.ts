import type { CookieOptions, Response } from 'express';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@harvestgo/shared';
import { isProduction } from '../env.js';

/** How long someone can stay away before they must log in again. */
export const SESSION_HOURS = 8;

const base: CookieOptions = {
  httpOnly: true, // page scripts cannot read it, so stolen-script attacks can't grab it
  sameSite: 'lax', // not sent along with requests started by other websites
  secure: isProduction, // only over https when live
  path: '/',
};

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export function setSessionCookies(res: Response, s: TokenPair) {
  res.cookie(ACCESS_COOKIE, s.access_token, { ...base, maxAge: s.expires_in * 1000 });
  res.cookie(REFRESH_COOKIE, s.refresh_token, { ...base, maxAge: SESSION_HOURS * 3600 * 1000 });
}

export function clearSessionCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, base);
  res.clearCookie(REFRESH_COOKIE, base);
}
