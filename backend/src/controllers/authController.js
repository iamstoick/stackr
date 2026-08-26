import crypto from 'node:crypto';

import config from '../config/env.js';
import passport from '../services/auth/passport.js';
import jwtService from '../services/auth/jwtService.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';

const STATE_COOKIE = 'sm_oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000;

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  };
}

function requireGoogleConfigured() {
  if (!config.features.googleOAuth) {
    throw ApiError.unavailable(
      'OAUTH_NOT_CONFIGURED',
      'Google sign-in is not configured on this server.',
    );
  }
}

/** GET /api/auth/google — redirect to Google's consent screen. */
export function startGoogleLogin(req, res, next) {
  try {
    requireGoogleConfigured();
  } catch (err) {
    return next(err);
  }

  // No server session, so CSRF state lives in a short-lived HTTP-only cookie
  // and is compared against the value Google echoes back.
  const state = crypto.randomBytes(24).toString('base64url');
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: STATE_TTL_MS,
  });

  return passport.authenticate('google', { session: false, state, scope: ['profile', 'email'] })(
    req,
    res,
    next,
  );
}

/** Verifies the OAuth state cookie before passport exchanges the code. */
export function verifyOAuthState(req, res, next) {
  const expected = req.cookies?.[STATE_COOKIE];
  const received = req.query?.state;
  res.clearCookie(STATE_COOKIE, { path: '/api/auth' });

  const ok =
    typeof expected === 'string' &&
    typeof received === 'string' &&
    expected.length === received.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));

  if (!ok) {
    logger.warn({ ip: req.ip }, 'Rejected OAuth callback with invalid state');
    return res.redirect(`${config.frontendUrl}/login?error=invalid_state`);
  }
  return next();
}

/** GET /api/auth/google/callback — exchange the code, mint the JWT cookie. */
export function completeGoogleLogin(req, res, next) {
  passport.authenticate('google', { session: false }, (err, user) => {
    if (err) {
      logger.error({ err }, 'OAuth callback failed');
      return res.redirect(`${config.frontendUrl}/login?error=oauth_failed`);
    }
    if (!user) {
      return res.redirect(`${config.frontendUrl}/login?error=access_denied`);
    }

    jwtService.setAuthCookie(res, jwtService.signToken(user));
    logger.info({ userId: user.id }, 'Session established');
    return res.redirect(`${config.frontendUrl}/`);
  })(req, res, next);
}

/** GET /api/auth/me */
export function getCurrentUser(req, res) {
  res.json({ user: publicUser(req.user) });
}

/** POST /api/auth/logout */
export function logout(_req, res) {
  jwtService.clearAuthCookie(res);
  res.json({ ok: true });
}

/** GET /api/auth/config — what the login page needs to know. */
export function getAuthConfig(_req, res) {
  res.json({ googleOAuthEnabled: config.features.googleOAuth });
}

export default {
  startGoogleLogin,
  verifyOAuthState,
  completeGoogleLogin,
  getCurrentUser,
  logout,
  getAuthConfig,
};
