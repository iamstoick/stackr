import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import config from '../config/env.js';
import logger from '../utils/logger.js';

function handler(req, res) {
  logger.warn({ ip: req.ip, path: req.originalUrl }, 'Rate limit exceeded');
  res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please retry in a moment.' },
  });
}

const base = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler,
  // Limits are per user when authenticated, per IP otherwise.
  keyGenerator: (req) => (req.user ? `u:${req.user.id}` : ipKeyGenerator(req.ip)),
  // Test runs must not trip the limiter.
  skip: () => config.isTest,
};

/** Broad limit applied to the whole API surface. */
export const apiLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 300 });

/** Auth endpoints are the most abuse-prone, so they get a tighter budget. */
export const authLimiter = rateLimit({ ...base, windowMs: 15 * 60_000, limit: 30 });

/** Each search keystroke burst hits the provider's rate limit, so cap it. */
export const searchLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 60 });

/** Writes (favorites, alerts) are cheap but should not be scriptable at scale. */
export const writeLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 60 });

export default { apiLimiter, authLimiter, searchLimiter, writeLimiter };
