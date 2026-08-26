import axios from 'axios';

import config from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';
import logger from '../../utils/logger.js';

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

const client = axios.create({
  baseURL: config.twelveData.baseUrl,
  timeout: config.twelveData.timeoutMs,
  headers: { Accept: 'application/json' },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function backoffMs(attempt, retryAfterHeader) {
  const retryAfter = Number(retryAfterHeader);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 10_000);
  return Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.random() * 250, 6_000);
}

/**
 * Twelve Data reports most failures as a 200 with `{status: "error", code}` in
 * the body, so the payload has to be inspected rather than just the HTTP status.
 */
function bodyError(data) {
  if (!data || data.status !== 'error') return null;
  return { code: Number(data.code) || 502, message: data.message ?? 'Unknown provider error' };
}

function translate({ status, code, message, path }) {
  if (status === 429 || code === 429) {
    return ApiError.tooManyRequests(
      'Chart data provider rate limit reached (Twelve Data allows 8 requests a minute on the free plan). Try again in a moment.',
    );
  }
  if ([401, 403].includes(status) || [401, 403].includes(code)) {
    return new ApiError(
      502,
      'PROVIDER_ACCESS_DENIED',
      'The chart data provider rejected the request. TWELVEDATA_API_KEY may be missing, invalid, ' +
        'or lack access to this interval on the current plan.',
    );
  }
  if (status === 404 || code === 404) {
    return ApiError.notFound(
      'STOCK_NOT_FOUND',
      'The chart data provider has no history for that symbol at this interval.',
    );
  }
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
    return new ApiError(504, 'PROVIDER_TIMEOUT', 'The chart data provider did not respond in time.');
  }

  logger.warn({ path, status, code, providerMessage: message }, 'Twelve Data request failed');
  return new ApiError(502, 'PROVIDER_ERROR', 'The chart data provider returned an unexpected error.');
}

/**
 * Single entry point for Twelve Data. The API key is sent as a query parameter
 * (the only form the provider documents), so nothing here ever logs a full URL
 * or the request params — only the path.
 */
export async function request(path, params = {}) {
  if (!config.features.twelveData) {
    throw ApiError.unavailable(
      'PROVIDER_NOT_CONFIGURED',
      'Chart data is unavailable because TWELVEDATA_API_KEY is not configured.',
    );
  }

  let lastFailure;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const startedAt = Date.now();
      const response = await client.get(path, {
        params: { ...params, apikey: config.twelveData.apiKey },
      });

      const inBody = bodyError(response.data);
      if (inBody) {
        lastFailure = { status: inBody.code, code: inBody.code, message: inBody.message, path };
        const transient = RETRYABLE_STATUSES.has(inBody.code);
        if (!transient || attempt === MAX_ATTEMPTS) break;
        await sleep(backoffMs(attempt));
        continue;
      }

      logger.debug({ path, ms: Date.now() - startedAt, attempt }, 'Twelve Data request ok');
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      lastFailure = {
        status,
        code: error.code,
        message: error.response?.data?.message,
        path,
      };

      const transient = !status || RETRYABLE_STATUSES.has(status) || error.code === 'ECONNABORTED';
      if (!transient || attempt === MAX_ATTEMPTS) break;

      const delay = backoffMs(attempt, error.response?.headers?.['retry-after']);
      logger.warn({ path, status, attempt, delay }, 'Retrying Twelve Data request');
      await sleep(delay);
    }
  }

  throw translate(lastFailure ?? { path });
}

export default { request };
