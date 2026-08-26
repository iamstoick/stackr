import config from '../config/env.js';
import favoriteService from '../services/market/favoriteService.js';
import marketDataService from '../services/market/marketDataService.js';
import { RANGE_KEYS } from '../services/market/rangeMapper.js';
import { computeRiskMetrics } from '../services/market/riskMetrics.js';
import asyncHandler from '../utils/asyncHandler.js';

const CANDLE_MAX_AGE_SECONDS = Math.round(config.market.candleCacheTtlMs / 1000);

/** GET /api/stocks/search?q= */
export const search = asyncHandler(async (req, res) => {
  const results = await marketDataService.searchStocks(req.query.q);
  res.json({ query: req.query.q, count: results.length, results });
});

/** GET /api/stocks/:symbol */
export const getStock = asyncHandler(async (req, res) => {
  const stock = await marketDataService.getStockDetail(req.params.symbol);
  const isFavorite = req.user ? await favoriteService.isFavorite(req.user.id, stock.symbol) : false;
  res.json({ stock: { ...stock, isFavorite } });
});

/** GET /api/stocks/:symbol/quote */
export const getQuote = asyncHandler(async (req, res) => {
  const quote = await marketDataService.getQuote(req.params.symbol);
  res.json({ quote });
});

/** GET /api/stocks/:symbol/candles?range= */
export const getCandles = asyncHandler(async (req, res) => {
  const candles = await marketDataService.getCandles(req.params.symbol, req.query.range);

  if (CANDLE_MAX_AGE_SECONDS > 0) {
    // Private: this is a per-user authenticated response, so only the browser
    // may store it. Matching the server-side TTL keeps both layers consistent.
    const remaining = Math.max(0, CANDLE_MAX_AGE_SECONDS - (candles.cache?.ageSeconds ?? 0));
    res.set('Cache-Control', `private, max-age=${remaining}`);
  }

  // Charts may come from a different provider than quotes, so the response says
  // which one answered and whether it came from cache.
  res.json({
    candles,
    provider: candles.provider,
    cache: candles.cache ?? { hit: false, ageSeconds: 0 },
    supportedRanges: RANGE_KEYS,
  });
});

/**
 * GET /api/stocks/:symbol/risk?range=&positionValue=
 *
 * How much this instrument actually moves, expressed in dollars against a
 * position size the caller chooses. Uses the cached candles, so it costs no
 * extra provider request.
 */
export const getRisk = asyncHandler(async (req, res) => {
  const candles = await marketDataService.getCandles(req.params.symbol, req.query.range);
  const risk = computeRiskMetrics(candles, { positionValue: req.query.positionValue });

  res.json({
    symbol: candles.symbol,
    range: candles.range,
    risk,
    // Said plainly so it cannot be mistaken for a forecast.
    basis: 'Measured from past prices in this window. It describes what has happened, not what will.',
  });
});

export default { search, getStock, getQuote, getCandles, getRisk };
