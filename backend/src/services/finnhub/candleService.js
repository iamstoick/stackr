import { secondsToDate } from '../../utils/time.js';
import { resolveRange } from '../market/rangeMapper.js';
import { request } from './finnhubClient.js';

/**
 * Turns Finnhub's column-oriented candle payload into row objects that Recharts
 * can consume directly.
 */
export function normalizeCandles(symbol, raw, range) {
  const noData = !raw || raw.s === 'no_data' || !Array.isArray(raw.t) || raw.t.length === 0;

  const points = noData
    ? []
    : raw.t.map((seconds, i) => ({
        time: secondsToDate(seconds).toISOString(),
        timestamp: seconds,
        open: raw.o?.[i] ?? null,
        high: raw.h?.[i] ?? null,
        low: raw.l?.[i] ?? null,
        close: raw.c?.[i] ?? null,
        volume: raw.v?.[i] ?? null,
      }));

  return {
    symbol: symbol.toUpperCase(),
    range: range.key,
    resolution: range.resolution,
    granularity: range.granularity,
    from: secondsToDate(range.from).toISOString(),
    to: secondsToDate(range.to).toISOString(),
    count: points.length,
    provider: 'finnhub',
    currency: null,
    exchange: null,
    points,
  };
}

/** Historical candles for a UI range. Fetched on demand, never stored. */
export async function getCandles(symbol, rangeKey) {
  const range = resolveRange(rangeKey);
  const raw = await request('/stock/candle', {
    symbol: symbol.toUpperCase(),
    resolution: range.resolution,
    from: range.from,
    to: range.to,
  });
  return normalizeCandles(symbol, raw, range);
}

export default { getCandles, normalizeCandles };
