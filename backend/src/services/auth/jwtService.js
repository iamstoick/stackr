import jwt from 'jsonwebtoken';

import config from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';

const ISSUER = 'stackr';

/** Minimal claims: the user id is all the API needs to authorize a request. */
export function signToken(user) {
  return jwt.sign({ sub: String(user.id) }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
    issuer: ISSUER,
  });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret, { issuer: ISSUER });
  } catch {
    // Deliberately opaque: expired vs. malformed is not the client's business.
    throw ApiError.unauthorized('Your session is invalid or has expired.');
  }
}

/** HTTP-only cookie options. The token is never exposed to JavaScript. */
export function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export function setAuthCookie(res, token) {
  res.cookie(config.jwt.cookieName, token, cookieOptions());
}

export function clearAuthCookie(res) {
  res.clearCookie(config.jwt.cookieName, { ...cookieOptions(), maxAge: undefined });
}

export default { signToken, verifyToken, cookieOptions, setAuthCookie, clearAuthCookie };
