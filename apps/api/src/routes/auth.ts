import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ACCESS_COOKIE, loginSchema, type LoginInput, type SessionUser } from '@harvestgo/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validate.js';
import { resolveAfterLogin, signIn } from '../services/authService.js';
import { revokeSession } from '../supabase.js';
import { clearSessionCookies, setSessionCookies } from '../utils/cookies.js';
import { sendError } from '../utils/http.js';

export function createAuthRouter() {
  const router = Router();

  // Slows down password guessing: 10 failed tries per 15 minutes per address.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      sendError(res, 429, 'TOO_MANY_ATTEMPTS', 'Too many tries. Please wait a few minutes.'),
  });

  router.post('/login', loginLimiter, validateBody(loginSchema), async (req, res, next) => {
    try {
      const { email, password } = req.body as LoginInput;
      const result = await signIn(email, password);
      // Same message whether the email or the password was wrong, on purpose.
      if (!result) return sendError(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');

      const ctx = await resolveAfterLogin(result.session.access_token);
      if (!ctx) {
        await revokeSession(result.session.access_token);
        return sendError(
          res,
          403,
          'ACCOUNT_INACTIVE',
          'This account is not active. Please contact the General Manager.',
        );
      }
      setSessionCookies(res, result.session);
      const user: SessionUser = { id: ctx.userId, email: ctx.email, fullName: ctx.fullName, role: ctx.role };
      return res.json({ user });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/logout', async (req, res) => {
    const access = req.cookies?.[ACCESS_COOKIE] as string | undefined;
    if (access) await revokeSession(access);
    clearSessionCookies(res);
    res.json({ ok: true });
  });

  router.get('/me', requireAuth, (req, res) => {
    const a = req.auth!;
    const user: SessionUser = { id: a.userId, email: a.email, fullName: a.fullName, role: a.role };
    res.json({ user });
  });

  return router;
}
