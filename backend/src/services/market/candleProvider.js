import config from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';
import logger from '../../utils/logger.js';
import finnhubCandleService from '../finnhub/candleService.js';
import twelveDataCandleService from '../twelvedata/candleService.js';
import { CandleCache } from './candleCache.js';

export const candleCache = new CandleCache({
  ttlMs: config.market.candleCacheTtlMs,
  maxEntries: config.market.candleCacheMaxEntries,
});

const PROVIDERS = {
  twelvedata: { name: 'twelvedata', service: twelveDataCandleService, enabled: () => config.features.twelveData },
  finnhub: { name: 'finnhub', service: finnhubCandleService, enabled: () => config.features.finnhub },
};

/**
 * Provider order for candles. Finnhub gates its candle endpoint behind a paid
 * plan, so when a Twelve Data key exists it goes first and Finnhub becomes the
 * fallback. An explicit CANDLE_PROVIDER pins the choice and disables fallback.
 */
export function candleProviderChain() {
  const pinned = config.market.candleProviderSetting;
  if (pinned !== 'auto') return [PROVIDERS[pinned]];

  const preferred = config.market.candleProvider;
  const other = preferred === 'twelvedata' ? 'finnhub' : 'twelvedata';
  return [PROVIDERS[preferred], PROVIDERS[other]].filter((p) => p.enabled());
}

/** Errors worth trying the next provider for: access and capability problems. */
function isWorthFallingBack(err) {
  return (
    err instanceof ApiError &&
    ['PROVIDER_ACCESS_DENIED', 'PROVIDER_NOT_CONFIGURED', 'SERVICE_UNAVAILABLE'].includes(err.code)
  );
}

/**
 * Fetches candles from the first provider that can serve them, falling back on
 * an access denial rather than surfacing a paywall to the user.
 *
 * Results are cached per symbol+range for the cache TTL, and concurrent misses
 * for the same key share one provider request. Only successes are cached, so a
 * failure never sticks.
 */
export async function getCandles(symbol, range) {
  if (config.market.candleCacheTtlMs === 0) return fetchFromChain(symbol, range);
  return candleCache.resolve(symbol, range, () => fetchFromChain(symbol, range));
}

async function fetchFromChain(symbol, range) {
  const chain = candleProviderChain();

  if (chain.length === 0) {
    throw ApiError.unavailable(
      'PROVIDER_NOT_CONFIGURED',
      'Charts are unavailable because no market data key is configured. Set TWELVEDATA_API_KEY.',
    );
  }

  let lastError;
  for (const provider of chain) {
    try {
      const candles = await provider.service.getCandles(symbol, range);
      if (lastError) {
        logger.info({ symbol, provider: provider.name }, 'Served candles from fallback provider');
      }
      return candles;
    } catch (err) {
      lastError = err;
      if (!isWorthFallingBack(err)) throw err;
      logger.warn(
        { symbol, provider: provider.name, code: err.code },
        'Candle provider unavailable; trying the next one',
      );
    }
  }

  throw lastError;
}

export default { getCandles, candleProviderChain, candleCache };
