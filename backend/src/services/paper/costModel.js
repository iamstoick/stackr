import config from '../../config/env.js';

/**
 * What a simulated trade actually costs.
 *
 * A paper-trading feature that fills at the mid price and charges nothing
 * teaches a beginner something false: that trading is free and that the price
 * on the screen is the price you get. Neither is true. Two costs are modelled:
 *
 *   spread     — you buy at the ask and sell at the bid, so a round trip loses
 *                the difference before the price has moved at all
 *   commission — zero at most brokers today, but configurable, because it is
 *                not zero everywhere
 *
 * The spread is estimated from the instrument's own daily range rather than
 * being a flat number, because that is how spreads actually behave: a heavily
 * traded large-cap costs a basis point or two to cross, a thin volatile name
 * costs far more. Beginners are drawn to exactly the volatile names where this
 * matters most, so a flat estimate would hide the lesson.
 */

const MIN_SPREAD_BPS = 2; // 0.02% — a liquid large-cap
const MAX_SPREAD_BPS = 60; // 0.60% — thin and jumpy

/** Basis points of round-trip spread, derived from the session's own range. */
export function estimateSpreadBps(quote) {
  const configured = config.paper.spreadBps;
  const { high, low, price } = quote ?? {};

  if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(price) || price <= 0) {
    return configured;
  }

  const rangePercent = ((high - low) / price) * 100;
  // Roughly a tenth of the day's range, floored and capped so a quiet day does
  // not imply a free trade and a wild day does not imply an absurd one.
  const derived = rangePercent * 10;

  return Math.min(MAX_SPREAD_BPS, Math.max(MIN_SPREAD_BPS, Math.max(configured, derived)));
}

/**
 * Prices one side of a trade.
 *
 * @param {'BUY'|'SELL'} side
 * @param {{price: number, high?: number, low?: number}} quote
 * @param {number} quantity
 */
export function priceOrder(side, quote, quantity) {
  const quotePrice = Number(quote.price);
  const spreadBps = estimateSpreadBps(quote);
  // Half the spread each way: the quote sits between bid and ask.
  const halfSpread = quotePrice * (spreadBps / 10_000 / 2);

  const fillPrice = side === 'BUY' ? quotePrice + halfSpread : quotePrice - halfSpread;
  const notional = fillPrice * quantity;
  const spreadCost = halfSpread * quantity;
  const commission = config.paper.commission;

  // Buying takes cash out; selling puts it in. Commission is paid either way.
  const cashDelta = side === 'BUY' ? -(notional + commission) : notional - commission;

  return {
    side,
    quantity,
    quotePrice: round(quotePrice),
    fillPrice: round(fillPrice),
    spreadBps: Math.round(spreadBps),
    spreadCost: round(spreadCost),
    commission: round(commission),
    notional: round(notional),
    totalCost: round(spreadCost + commission),
    cashDelta: round(cashDelta),
    // What the position must move to break even on this trade alone.
    breakEvenMovePercent: notional > 0 ? round(((spreadCost + commission) / notional) * 100, 4) : 0,
  };
}

/** How much cash a buy needs, including costs. */
export function cashRequired(quote, quantity) {
  return Math.abs(priceOrder('BUY', quote, quantity).cashDelta);
}

/** Largest whole-share order the given cash can cover, costs included. */
export function affordableQuantity(quote, cash) {
  const perShare = priceOrder('BUY', quote, 1);
  const unit = Math.abs(perShare.cashDelta) - config.paper.commission;
  if (unit <= 0) return 0;
  return Math.max(0, Math.floor((cash - config.paper.commission) / unit));
}

function round(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(Number(value) * factor) / factor;
}

export default { estimateSpreadBps, priceOrder, cashRequired, affordableQuantity };
