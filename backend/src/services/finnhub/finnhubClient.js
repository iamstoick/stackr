import axios from 'axios';

import config from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';
import logger from '../../utils/logger.js';

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 400;

const client = axios.create({
  baseURL: config.finnhub.baseUrl,
  timeout: config.finnhub.timeoutMs,
  headers: { Accept: 'application/json' },
});

// The key travels in a header, never in the query string, so it cannot leak
// through axios error messages or proxy access logs.
client.interceptors.request.use((request) => {
  request.headers['X-Finnhub-Token'] = config.finnhub.apiKey;
  return request;
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Honour Retry-After when present, otherwise exponential backoff with jitter. */
function backoffMs(attempt, retryAfterHeader) {
  const retryAfter = Number(retryAfterHeader);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 10_000);
  const exponential = BASE_BACKOFF_MS * 2 ** (attempt - 1);
  return Math.min(exponential + Math.random() * 200, 5_000);
}

function translate(error, path) {
  const status = error.response?.status;

  if (status === 429) {
    return ApiError.tooManyRequests('Market data provider rate limit reached. Please retry shortly.');
  }
  if (status === 401 || status === 403) {
    return new ApiError(
      502,
      'PROVIDER_ACCESS_DENIED',
      'The market data provider rejected the request. The API key may be missing, invalid, or ' +
        'lack access to this endpoint on the current plan.',
    );
  }
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return new ApiError(504, 'PROVIDER_TIMEOUT', 'The market data provider did not respond in time.');
  }
  logger.warn({ path, status, code: error.code }, 'Finnhub request failed');
  return new ApiError(502, 'PROVIDER_ERROR', 'The market data provider returned an unexpected error.');
}

/**
 * Single entry point for every Finnhub call: injects auth, enforces the
 * timeout, retries only transient failures with backoff, and converts provider
 * errors into ApiError values. Credentials are never logged.
 */
export async function request(path, params = {}) {
  if (!config.features.finnhub) {
    throw ApiError.unavailable(
      'PROVIDER_NOT_CONFIGURED',
      'Market data is unavailable because FINNHUB_API_KEY is not configured.',
    );
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const startedAt = Date.now();
      const response = await client.get(path, { params });
      logger.debug({ path, ms: Date.now() - startedAt, attempt }, 'Finnhub request ok');
      return response.data;
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      const transient = !status || RETRYABLE_STATUSES.has(status) || error.code === 'ECONNABORTED';

      if (!transient || attempt === MAX_ATTEMPTS) break;

      const delay = backoffMs(attempt, error.response?.headers?.['retry-after']);
      logger.warn({ path, status, attempt, delay }, 'Retrying Finnhub request');
      await sleep(delay);
    }
  }

  throw translate(lastError, path);
}

export default { request };
