import favoriteRepository from '../../db/repositories/favoriteRepository.js';
import latestPriceRepository from '../../db/repositories/latestPriceRepository.js';
import stockRepository from '../../db/repositories/stockRepository.js';
import ApiError from '../../utils/ApiError.js';
import logger from '../../utils/logger.js';
import marketDataService from './marketDataService.js';

const MAX_FAVORITES_PER_USER = 100;

export async function list(userId) {
  return favoriteRepository.listByUser(userId);
}

/**
 * Adds a symbol to the watchlist. Idempotent, and seeds `latest_prices` so the
 * dashboard shows a price before the next poller tick.
 */
export async function add(userId, symbol) {
  const stock = await marketDataService.ensureStock(symbol);
  const already = await favoriteRepository.exists(userId, stock.id);

  if (!already) {
    const current = await favoriteRepository.listByUser(userId);
    if (current.length >= MAX_FAVORITES_PER_USER) {
      throw ApiError.conflict(
        'FAVORITE_LIMIT_REACHED',
        `You can follow at most ${MAX_FAVORITES_PER_USER} stocks.`,
      );
    }
  }

  const { created } = await favoriteRepository.add(userId, stock.id);

  if (created) {
    logger.info({ userId, symbol: stock.symbol }, 'Favorite added');
    try {
      const quote = await marketDataService.getQuote(stock.symbol, { persist: false });
      await latestPriceRepository.upsert({ ...quote, stockId: stock.id, symbol: stock.symbol });
    } catch (err) {
      // A missing seed price is cosmetic; the poller fills it in shortly.
      logger.warn({ err, symbol: stock.symbol }, 'Could not seed price for new favorite');
    }
  }

  return { created, stock };
}

/** Removing something that is not favorited is a success, not an error. */
export async function remove(userId, symbol) {
  const normalized = marketDataService.normalizeSymbol(symbol);
  const stock = await stockRepository.findBySymbol(normalized);
  if (!stock) return { removed: false };

  const { removed } = await favoriteRepository.remove(userId, stock.id);
  if (removed) logger.info({ userId, symbol: normalized }, 'Favorite removed');
  return { removed };
}

export async function isFavorite(userId, symbol) {
  const stock = await stockRepository.findBySymbol(marketDataService.normalizeSymbol(symbol));
  if (!stock) return false;
  return favoriteRepository.exists(userId, stock.id);
}

export default { list, add, remove, isFavorite };
