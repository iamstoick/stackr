import latestPriceRepository from '../../db/repositories/latestPriceRepository.js';
import stockRepository from '../../db/repositories/stockRepository.js';
import ApiError from '../../utils/ApiError.js';
import logger from '../../utils/logger.js';
import { marketSession } from './marketCalendar.js';
import quoteService from '../finnhub/quoteService.js';
import stockService from '../finnhub/stockService.js';
import candleProvider from './candleProvider.js';

const SYMBOL_PATTERN = /^[A-Z0-9.\-]{1,15}$/;

export function normalizeSymbol(raw) {
  const symbol = String(raw ?? '').trim().toUpperCase();
  if (!SYMBOL_PATTERN.test(symbol)) {
    throw ApiError.badRequest(`"${raw}" is not a valid stock symbol.`);
  }
  return symbol;
}

/**
 * How current the quote is, so the UI never presents stale data as live.
 *
 * The provider's free tier quotes the *regular* session only. Outside regular
 * hours the number is therefore the last regular-session trade, not a live one,
 * and it is labelled as such instead of being dressed up as current.
 */
function describeFreshness(quote, { source }) {
  const session = marketSession();
  const quoteTime = quote?.timestamp ? new Date(quote.timestamp).getTime() : null;
  const ageSeconds = quoteTime ? Math.max(0, Math.round((Date.now() - quoteTime) / 1000)) : null;

  const isLive = session.isRegularSession && ageSeconds !== null && ageSeconds <= 120;

  return {
    source,
    marketSession: session.session,
    sessionLabel: session.holiday ?? null,
    earlyClose: session.earlyClose ?? null,
    exchangeTime: session.exchangeTime,
    exchangeTimezone: session.timezone,
    isTradingDay: session.isTradingDay,
    asOf: quote?.timestamp ?? null,
    ageSeconds,
    live: source === 'provider' && isLive,
    stale: source === 'cache' || (session.isRegularSession && !isLive),
    // Extended-hours and closed-session prices are the last regular-session
    // trade; the provider's plan does not include pre/post-market quotes.
    regularSessionOnly: !session.isRegularSession,
  };
}

/**
 * Makes sure a local `stocks` row exists for the symbol, enriching it from the
 * provider profile. This is the only place stock metadata is written.
 */
export async function ensureStock(symbol) {
  const upper = normalizeSymbol(symbol);
  const existing = await stockRepository.findBySymbol(upper);

  // Metadata is slow-changing; refresh at most daily to spare the rate limit.
  const dayMs = 24 * 60 * 60 * 1000;
  const isFresh = existing?.companyName && Date.now() - new Date(existing.updatedAt).getTime() < dayMs;
  if (isFresh) return existing;

  let profile = null;
  try {
    profile = await stockService.getProfile(upper);
  } catch (err) {
    if (existing) {
      logger.warn({ err, symbol: upper }, 'Profile refresh failed; using cached stock metadata');
      return existing;
    }
    throw err;
  }

  if (!profile) {
    if (existing) return existing;
    // No profile at all: only accept the symbol if it has a live quote.
    await quoteService.getQuote(upper);
    return stockRepository.upsert({ symbol: upper });
  }

  return stockRepository.upsert({
    symbol: upper,
    companyName: profile.companyName,
    exchange: profile.exchange,
    currency: profile.currency,
    country: profile.country,
    logoUrl: profile.logoUrl,
  });
}

export async function searchStocks(term) {
  const results = await stockService.search(term);
  return results;
}

/**
 * Current quote. On provider failure the last polled price is returned and
 * flagged as cached rather than failing the request outright.
 */
export async function getQuote(symbol, { persist = true } = {}) {
  const upper = normalizeSymbol(symbol);

  try {
    const quote = await quoteService.getQuote(upper);

    if (persist) {
      const stock = await stockRepository.findBySymbol(upper);
      if (stock) {
        await latestPriceRepository.upsert({ ...quote, stockId: stock.id, symbol: upper });
      }
    }
    return { ...quote, data: describeFreshness(quote, { source: 'provider' }) };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw err;

    const cached = await latestPriceRepository.findBySymbol(upper);
    if (!cached || cached.price === null) throw err;

    logger.warn({ err, symbol: upper }, 'Serving cached quote after provider failure');
    const quote = {
      symbol: upper,
      price: cached.price,
      change: cached.change,
      changePercent: cached.changePercent,
      high: cached.high,
      low: cached.low,
      open: cached.open,
      previousClose: cached.previousClose,
      timestamp: cached.timestamp ? new Date(cached.timestamp).toISOString() : null,
    };
    return { ...quote, data: describeFreshness(quote, { source: 'cache' }) };
  }
}

/** Stock detail: local metadata + provider profile + current quote. */
export async function getStockDetail(symbol) {
  const upper = normalizeSymbol(symbol);
  const stock = await ensureStock(upper);

  const [profile, quote] = await Promise.all([
    stockService.getProfile(upper).catch((err) => {
      logger.warn({ err, symbol: upper }, 'Profile lookup failed for stock detail');
      return null;
    }),
    getQuote(upper),
  ]);

  return {
    symbol: upper,
    companyName: profile?.companyName ?? stock.companyName,
    exchange: profile?.exchange ?? stock.exchange,
    currency: profile?.currency ?? stock.currency,
    country: profile?.country ?? stock.country,
    logoUrl: profile?.logoUrl ?? stock.logoUrl,
    industry: profile?.industry ?? null,
    website: profile?.website ?? null,
    ipo: profile?.ipo ?? null,
    marketCapitalization: profile?.marketCapitalization ?? null,
    quote,
  };
}

export async function getCandles(symbol, range) {
  return candleProvider.getCandles(normalizeSymbol(symbol), range);
}

export default {
  normalizeSymbol,
  ensureStock,
  searchStocks,
  getQuote,
  getStockDetail,
  getCandles,
};
