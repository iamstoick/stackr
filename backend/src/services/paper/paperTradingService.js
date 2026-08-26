import config from '../../config/env.js';
import { withTransaction } from '../../db/pool.js';
import portfolioRepository from '../../db/repositories/portfolioRepository.js';
import ApiError from '../../utils/ApiError.js';
import logger from '../../utils/logger.js';
import { marketSession } from '../market/marketCalendar.js';
import marketDataService from '../market/marketDataService.js';
import costModel from './costModel.js';

/**
 * Simulated trading against real quotes.
 *
 * The point is not to be a broker; it is to make abstractions concrete. A
 * beginner who has bought something learns what a position is, why the price
 * they paid matters more than today's price, and what a 5% move does to their
 * own money rather than to a line on a chart.
 *
 * Money is never invented: every order moves cash and position together inside
 * one transaction, with the portfolio row locked, so two concurrent orders
 * cannot spend the same cash twice.
 */

const round = (value, decimals = 4) => {
  const factor = 10 ** decimals;
  return Math.round(Number(value) * factor) / factor;
};

export async function getPortfolio(userId) {
  await portfolioRepository.ensurePortfolio(userId, config.paper.startingCash);
  const [portfolio, positions] = await Promise.all([
    portfolioRepository.findPortfolio(userId),
    portfolioRepository.listPositions(userId),
  ]);

  // One quote per held symbol; failures degrade to cost basis rather than
  // breaking the whole page.
  const quotes = await Promise.all(
    positions.map((position) =>
      marketDataService
        .getQuote(position.symbol)
        .then((quote) => [position.symbol, quote])
        .catch(() => [position.symbol, null]),
    ),
  );
  const quoteBySymbol = Object.fromEntries(quotes);

  const enriched = positions.map((position) => {
    const quote = quoteBySymbol[position.symbol];
    const price = Number.isFinite(quote?.price) ? quote.price : Number(position.avgCost);
    const marketValue = price * Number(position.quantity);
    const costBasis = Number(position.avgCost) * Number(position.quantity);
    const unrealizedPnl = marketValue - costBasis;

    return {
      ...position,
      price,
      priceKnown: Number.isFinite(quote?.price),
      dayChangePercent: quote?.changePercent ?? null,
      marketValue: round(marketValue, 2),
      costBasis: round(costBasis, 2),
      unrealizedPnl: round(unrealizedPnl, 2),
      unrealizedPnlPercent: costBasis > 0 ? round((unrealizedPnl / costBasis) * 100, 2) : 0,
      // What the price must reach to break even, costs included.
      breakEvenPrice: round(position.avgCost, 4),
    };
  });

  const positionsValue = enriched.reduce((sum, p) => sum + p.marketValue, 0);
  const cash = Number(portfolio.cash);
  const equity = cash + positionsValue;
  const startingCash = Number(portfolio.startingCash);
  const totalReturn = equity - startingCash;

  return {
    portfolio: {
      cash: round(cash, 2),
      startingCash: round(startingCash, 2),
      positionsValue: round(positionsValue, 2),
      equity: round(equity, 2),
      totalReturn: round(totalReturn, 2),
      totalReturnPercent: startingCash > 0 ? round((totalReturn / startingCash) * 100, 2) : 0,
      realizedPnl: round(portfolio.realizedPnl, 2),
      unrealizedPnl: round(
        enriched.reduce((sum, p) => sum + p.unrealizedPnl, 0),
        2,
      ),
      totalCostsPaid: round(portfolio.totalCostsPaid, 2),
      // Costs as a share of what they started with: the number that surprises
      // people who trade often.
      costDragPercent:
        startingCash > 0 ? round((Number(portfolio.totalCostsPaid) / startingCash) * 100, 2) : 0,
      tradeCount: portfolio.tradeCount,
      resetCount: portfolio.resetCount,
      openedAt: portfolio.openedAt,
      cashPercent: equity > 0 ? round((cash / equity) * 100, 1) : 100,
    },
    positions: enriched
      .map((position) => ({
        ...position,
        // Concentration is the risk beginners take without noticing.
        allocationPercent: equity > 0 ? round((position.marketValue / equity) * 100, 1) : 0,
      }))
      .sort((a, b) => b.marketValue - a.marketValue),
  };
}

/**
 * Prices an order without placing it, so the UI can show exactly what the trade
 * will cost before the user commits.
 */
export async function previewOrder(userId, { symbol, side, quantity }) {
  const normalized = marketDataService.normalizeSymbol(symbol);
  const [{ portfolio }, quote] = await Promise.all([
    getPortfolio(userId),
    marketDataService.getQuote(normalized),
  ]);

  if (!Number.isFinite(quote.price) || quote.price <= 0) {
    throw ApiError.unavailable('NO_PRICE', `No usable price for ${normalized} right now.`);
  }

  const priced = costModel.priceOrder(side, quote, quantity);
  const session = marketSession();
  const positions = await portfolioRepository.listPositions(userId);
  const held = positions.find((position) => position.symbol === normalized);

  return {
    symbol: normalized,
    order: priced,
    quote: { price: quote.price, changePercent: quote.changePercent },
    cashAfter: round(portfolio.cash + priced.cashDelta, 2),
    affordable: side === 'SELL' || portfolio.cash + priced.cashDelta >= 0,
    maxAffordableQuantity: costModel.affordableQuantity(quote, portfolio.cash),
    heldQuantity: held ? Number(held.quantity) : 0,
    marketOpen: session.isRegularSession,
    marketSession: session.session,
    // A real order placed now would queue to the next open and could fill at a
    // different price. Saying so is part of the lesson.
    wouldQueue: !session.isRegularSession,
  };
}

async function resolveOrder(userId, { symbol, side, quantity }) {
  const normalized = marketDataService.normalizeSymbol(symbol);
  const size = Number(quantity);

  if (!Number.isFinite(size) || size <= 0) {
    throw ApiError.badRequest('Quantity must be greater than zero.');
  }

  const stock = await marketDataService.ensureStock(normalized);
  const quote = await marketDataService.getQuote(normalized);

  if (!Number.isFinite(quote.price) || quote.price <= 0) {
    throw ApiError.unavailable('NO_PRICE', `No usable price for ${normalized} right now.`);
  }

  const priced = costModel.priceOrder(side, quote, size);
  if (priced.notional > config.paper.maxOrderValue) {
    throw ApiError.badRequest(
      `Single orders are capped at $${config.paper.maxOrderValue.toLocaleString()} in the simulator.`,
    );
  }

  return { normalized, size, stock, quote, priced };
}

/** Places a simulated order. Cash and position move together or not at all. */
export async function placeOrder(userId, { symbol, side, quantity }) {
  const { normalized, size, stock, quote, priced } = await resolveOrder(userId, {
    symbol,
    side,
    quantity,
  });
  const session = marketSession();

  await portfolioRepository.ensurePortfolio(userId, config.paper.startingCash);

  return withTransaction(async (client) => {
    const portfolio = await portfolioRepository.lockPortfolio(userId, client);
    const existing = await portfolioRepository.findPosition(userId, stock.id, client);

    let realizedPnl = null;

    if (side === 'BUY') {
      const cashNeeded = -priced.cashDelta;
      if (cashNeeded > Number(portfolio.cash)) {
        throw ApiError.badRequest(
          `Not enough simulated cash. This order needs $${cashNeeded.toFixed(2)} including costs, ` +
            `and you have $${Number(portfolio.cash).toFixed(2)}.`,
        );
      }

      const heldQuantity = existing ? Number(existing.quantity) : 0;
      const heldCost = existing ? Number(existing.avgCost) * heldQuantity : 0;
      const newQuantity = heldQuantity + size;
      // Average cost includes commission and spread, so the break-even price
      // shown to the user is the true one.
      const newAvgCost = (heldCost + priced.notional + priced.commission) / newQuantity;

      await portfolioRepository.upsertPosition(
        {
          userId,
          stockId: stock.id,
          symbol: normalized,
          quantity: round(newQuantity, 6),
          avgCost: round(newAvgCost, 4),
        },
        client,
      );
    } else {
      const heldQuantity = existing ? Number(existing.quantity) : 0;
      if (heldQuantity <= 0) {
        throw ApiError.badRequest(
          `You do not hold any ${normalized}. Short selling is not part of the simulator.`,
        );
      }
      if (size > heldQuantity + 1e-9) {
        throw ApiError.badRequest(
          `You hold ${heldQuantity} ${normalized}, so you cannot sell ${size}.`,
        );
      }

      const avgCost = Number(existing.avgCost);
      realizedPnl = round(priced.cashDelta - avgCost * size, 4);

      const remaining = round(heldQuantity - size, 6);
      if (remaining <= 0) {
        await portfolioRepository.deletePosition(userId, stock.id, client);
      } else {
        await portfolioRepository.upsertPosition(
          { userId, stockId: stock.id, symbol: normalized, quantity: remaining, avgCost },
          client,
        );
      }
    }

    const updated = await portfolioRepository.applyCash(
      {
        userId,
        cashDelta: priced.cashDelta,
        costs: priced.totalCost,
        realizedPnl: realizedPnl ?? 0,
      },
      client,
    );

    const trade = await portfolioRepository.recordTrade(
      {
        userId,
        stockId: stock.id,
        symbol: normalized,
        side,
        quantity: size,
        quotePrice: priced.quotePrice,
        fillPrice: priced.fillPrice,
        spreadCost: priced.spreadCost,
        commission: priced.commission,
        cashDelta: priced.cashDelta,
        realizedPnl,
        filledWhileClosed: !session.isRegularSession,
        marketSession: session.session,
      },
      client,
    );

    logger.info(
      { userId, symbol: normalized, side, quantity: size, fillPrice: priced.fillPrice },
      'Paper trade executed',
    );

    return {
      trade,
      cash: round(updated.cash, 2),
      costs: priced,
      realizedPnl,
      filledWhileClosed: !session.isRegularSession,
      lesson: !session.isRegularSession
        ? 'Filled at the last traded price. A real broker would have queued this until the next ' +
          'open, and the opening price is often different — that gap is why market orders placed ' +
          'overnight can surprise you.'
        : null,
    };
  });
}

export async function listTrades(userId, options) {
  const [trades, total] = await Promise.all([
    portfolioRepository.listTrades(userId, options),
    portfolioRepository.countTrades(userId),
  ]);
  return { trades, total };
}

export async function resetPortfolio(userId) {
  await portfolioRepository.ensurePortfolio(userId, config.paper.startingCash);
  const portfolio = await withTransaction((client) =>
    portfolioRepository.resetPortfolio(userId, config.paper.startingCash, client),
  );
  logger.info({ userId }, 'Paper portfolio reset');
  return portfolio;
}

export default {
  getPortfolio,
  previewOrder,
  placeOrder,
  listTrades,
  resetPortfolio,
};
