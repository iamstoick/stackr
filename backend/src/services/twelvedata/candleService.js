import config from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';
import logger from '../../utils/logger.js';
import { secondsToDate } from '../../utils/time.js';
import { resolveRange } from '../market/rangeMapper.js';
import { request } from './twelveDataClient.js';

// The provider serves extended-hours bars only on higher plans, and only for
// intervals of 30 minutes or less. Rather than fail a chart on a plan that does
// not include them, the first rejection turns the flag off for this process.
const PREPOST_INTERVALS = new Set(['1min', '5min', '15min', '30min']);
let prepostRejected = false;

/** Twelve Data wants `YYYY-MM-DD HH:MM:SS`; requests are pinned to UTC. */
function toProviderDate(seconds) {
  return secondsToDate(seconds).toISOString().slice(0, 19).replace('T', ' ');
}

const num = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * `datetime` is `YYYY-MM-DD HH:MM:SS` for intraday intervals and `YYYY-MM-DD`
 * for daily and coarser ones. Both are UTC because the request asks for it.
 */
function toIso(datetime) {
  if (typeof datetime !== 'string') return null;
  const normalized = datetime.includes(' ') ? `${datetime.replace(' ', 'T')}Z` : `${datetime}T00:00:00Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Normalizes a `/time_series` payload into the same shape the Finnhub candle
 * service produces, so the API contract and the chart never change with the
 * provider. Values arrive newest-first and are reversed into chart order.
 */
export function normalizeTimeSeries(symbol, raw, range) {
  const values = Array.isArray(raw?.values) ? raw.values : [];

  const points = values
    .map((value) => {
      const time = toIso(value?.datetime);
      if (!time) return null;
      return {
        time,
        timestamp: Math.floor(new Date(time).getTime() / 1000),
        open: num(value.open),
        high: num(value.high),
        low: num(value.low),
        close: num(value.close),
        volume: num(value.volume),
      };
    })
    .filter((point) => point !== null && point.close !== null)
    .sort((a, b) => a.timestamp - b.timestamp);

  return {
    symbol: symbol.toUpperCase(),
    range: range.key,
    resolution: range.interval,
    granularity: range.granularity,
    from: secondsToDate(range.from).toISOString(),
    to: secondsToDate(range.to).toISOString(),
    count: points.length,
    provider: 'twelvedata',
    currency: raw?.meta?.currency ?? null,
    exchange: raw?.meta?.exchange ?? null,
    points,
  };
}

/** Historical candles for a UI range. Fetched on demand, never stored. */
export async function getCandles(symbol, rangeKey) {
  const range = resolveRange(rangeKey);

  const params = {
    symbol: symbol.toUpperCase(),
    interval: range.interval,
    start_date: toProviderDate(range.from),
    end_date: toProviderDate(range.to),
    outputsize: range.outputSize,
    timezone: 'UTC',
    format: 'JSON',
  };

  // Gaps happen before the bell and after it, so extended-hours bars are worth
  // asking for where the plan allows them.
  const wantsPrepost =
    config.twelveData.prepost && !prepostRejected && PREPOST_INTERVALS.has(range.interval);

  try {
    const raw = await request('/time_series', wantsPrepost ? { ...params, prepost: 'true' } : params);
    return normalizeTimeSeries(symbol, raw, range);
  } catch (err) {
    const rejectedForPrepost =
      wantsPrepost &&
      err instanceof ApiError &&
      ['PROVIDER_ACCESS_DENIED', 'STOCK_NOT_FOUND'].includes(err.code);

    if (!rejectedForPrepost) throw err;

    prepostRejected = true;
    logger.warn(
      { symbol, interval: range.interval },
      'Provider rejected extended-hours bars; falling back to regular-session data for this process',
    );
    const raw = await request('/time_series', params);
    return normalizeTimeSeries(symbol, raw, range);
  }
}

/** Test seam: forget that extended hours were rejected. */
export function resetPrepostState() {
  prepostRejected = false;
}

export default { getCandles, normalizeTimeSeries, resetPrepostState };
