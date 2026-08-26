import ApiError from '../../utils/ApiError.js';
import { secondsToDate } from '../../utils/time.js';
import { request } from './finnhubClient.js';

const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * Normalizes Finnhub's terse quote payload (`c`, `d`, `dp`, ...) into the shape
 * the API exposes. Raw provider fields never reach the frontend.
 */
export function normalizeQuote(symbol, raw) {
  return {
    symbol: symbol.toUpperCase(),
    price: num(raw?.c),
    change: num(raw?.d),
    changePercent: num(raw?.dp),
    high: num(raw?.h),
    low: num(raw?.l),
    open: num(raw?.o),
    previousClose: num(raw?.pc),
    timestamp: num(raw?.t) ? secondsToDate(raw.t).toISOString() : null,
  };
}

/**
 * Current quote for a symbol. Finnhub answers unknown symbols with a
 * zero-filled body rather than a 404, so a zero price with no previous close
 * is treated as "unknown symbol".
 */
export async function getQuote(symbol) {
  const raw = await request('/quote', { symbol: symbol.toUpperCase() });
  const quote = normalizeQuote(symbol, raw);

  if (!quote.price && !quote.previousClose) {
    throw ApiError.notFound('STOCK_NOT_FOUND', `No market data is available for "${symbol}".`);
  }
  return quote;
}

export default { getQuote, normalizeQuote };
