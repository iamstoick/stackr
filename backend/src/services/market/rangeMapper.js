import ApiError from '../../utils/ApiError.js';
import { daysToSeconds, nowSeconds } from '../../utils/time.js';

/**
 * UI timeframe -> provider parameters plus the lookback window that makes that
 * resolution useful. Both candle providers are described here so the frontend
 * never needs to know provider-specific interval codes.
 *
 * `resolution` is Finnhub's code; `interval` is Twelve Data's.
 */
export const RANGES = {
  '1m': {
    label: '1m',
    granularity: 'minute',
    lookbackDays: 1,
    resolution: '1',
    interval: '1min',
    outputSize: 1500,
  },
  '1h': {
    label: '1h',
    granularity: 'hour',
    lookbackDays: 7,
    resolution: '60',
    interval: '1h',
    outputSize: 400,
  },
  '1d': {
    label: '1D',
    granularity: 'day',
    lookbackDays: 90,
    resolution: 'D',
    interval: '1day',
    outputSize: 200,
  },
  '1w': {
    label: '1W',
    granularity: 'week',
    lookbackDays: 365,
    resolution: 'W',
    interval: '1week',
    outputSize: 200,
  },
  '1mo': {
    label: '1M',
    granularity: 'month',
    lookbackDays: 365 * 5,
    resolution: 'M',
    interval: '1month',
    outputSize: 200,
  },
  '1y': {
    label: '1Y',
    granularity: 'year',
    lookbackDays: 365 * 20,
    resolution: 'M',
    interval: '1month',
    outputSize: 400,
  },
};

export const RANGE_KEYS = Object.keys(RANGES);
export const DEFAULT_RANGE = '1d';

/** Resolves a range key into concrete provider parameters. */
export function resolveRange(rangeKey = DEFAULT_RANGE, now = nowSeconds()) {
  const key = String(rangeKey).toLowerCase();
  const range = RANGES[key];
  if (!range) {
    throw ApiError.badRequest(
      `Unsupported range "${rangeKey}". Supported ranges: ${RANGE_KEYS.join(', ')}.`,
    );
  }

  return {
    key,
    label: range.label,
    granularity: range.granularity,
    resolution: range.resolution,
    interval: range.interval,
    outputSize: range.outputSize,
    from: now - daysToSeconds(range.lookbackDays),
    to: now,
  };
}

export default { RANGES, RANGE_KEYS, DEFAULT_RANGE, resolveRange };
