import config from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';

/** Terminal 404 for unmatched API routes. */
export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound('ROUTE_NOT_FOUND', `No route matches ${req.method} ${req.originalUrl}.`));
}

// Postgres error codes worth translating into a client-meaningful response.
const PG_CODES = {
  '23505': () => ApiError.conflict('CONFLICT', 'That record already exists.'),
  '23503': () => ApiError.badRequest('A referenced record does not exist.'),
  '23514': () => ApiError.validation('A value violates a database constraint.'),
};

function toApiError(err) {
  if (err instanceof ApiError) return err;

  if (err?.code && PG_CODES[err.code]) return PG_CODES[err.code]();
  if (err?.code === '23505') return ApiError.conflict('CONFLICT', 'That record already exists.');

  // Body parser failures.
  if (err?.type === 'entity.parse.failed') return ApiError.badRequest('Request body is not valid JSON.');
  if (err?.type === 'entity.too.large') return ApiError.badRequest('Request body is too large.');

  // Connection-level database failures.
  if (['ECONNREFUSED', 'ETIMEDOUT', '57P01', '08006', '08003'].includes(err?.code)) {
    return ApiError.unavailable('DATABASE_UNAVAILABLE', 'The database is temporarily unavailable.');
  }

  return ApiError.internal();
}

/**
 * Centralized error handler. Produces the single documented error envelope and
 * never leaks stack traces, secrets or internal paths in production.
 */
export function errorHandler(err, req, res, _next) {
  const apiError = toApiError(err);
  const logPayload = {
    err,
    status: apiError.status,
    code: apiError.code,
    method: req.method,
    path: req.originalUrl,
    userId: req.user?.id,
  };

  if (apiError.status >= 500) logger.error(logPayload, 'Request failed');
  else logger.warn(logPayload, 'Request rejected');

  const body = {
    error: {
      code: apiError.code,
      message: apiError.message,
    },
  };
  if (apiError.details) body.error.details = apiError.details;
  if (!config.isProduction && apiError.status >= 500 && err?.stack) {
    body.error.stack = err.stack.split('\n').slice(0, 5);
  }

  res.status(apiError.status).json(body);
}

export default errorHandler;
