import config from '../config/env.js';
import userRepository from '../db/repositories/userRepository.js';
import jwtService from '../services/auth/jwtService.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';

function readToken(req) {
  const cookieToken = req.cookies?.[config.jwt.cookieName];
  if (cookieToken) return cookieToken;

  // Bearer tokens are accepted for API clients and integration tests; browsers
  // always use the HTTP-only cookie.
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/**
 * Rejects the request unless it carries a valid JWT for an existing user, and
 * attaches that user to `req.user` for downstream authorization.
 */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = readToken(req);
  if (!token) throw ApiError.unauthorized();

  const payload = jwtService.verifyToken(token);
  const user = await userRepository.findById(Number(payload.sub));
  if (!user) {
    logger.warn({ sub: payload.sub }, 'Rejected token for unknown user');
    throw ApiError.unauthorized('Your session is no longer valid.');
  }

  req.user = user;
  next();
});

/** Populates `req.user` when a token is present, but never rejects. */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = readToken(req);
  if (token) {
    try {
      const payload = jwtService.verifyToken(token);
      req.user = await userRepository.findById(Number(payload.sub));
    } catch {
      req.user = undefined;
    }
  }
  next();
});

export default requireAuth;
