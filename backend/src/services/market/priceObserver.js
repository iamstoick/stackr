import latestPriceRepository from '../../db/repositories/latestPriceRepository.js';
import logger from '../../utils/logger.js';
import { exchangeDate } from './marketCalendar.js';

/**
 * Turns a sequence of point-in-time quotes into the price *range* covered
 * between two observations.
 *
 * The provider's quote carries the session high and low so far. If this poll
 * reports a higher high than the previous poll did, that new high can only have
 * happened in between — which is exactly the interval extreme an alert needs.
 * When neither extreme moved, the interval's range is bounded by the last trade
 * itself.
 *
 * This is what makes a threshold crossing that reversed between two polls
 * visible, without pulling per-minute candles for every watched symbol.
 */
export function deriveInterval(previous, quote, { sessionDate }) {
  const price = Number.isFinite(quote.price) ? quote.price : null;
  if (price === null) {
    return { intervalHigh: null, intervalLow: null, isFirstOfSession: true, sessionDate };
  }

  // A new trading day, or no history: the session's own high and low may predate
  // the rules being written, so only the last trade is trustworthy here.
  const isFirstOfSession = !previous || previous.sessionDate !== sessionDate;
  if (isFirstOfSession) {
    return { intervalHigh: price, intervalLow: price, isFirstOfSession: true, sessionDate };
  }

  const madeNewHigh =
    Number.isFinite(quote.high) && Number.isFinite(previous.high) && quote.high > previous.high;
  const madeNewLow =
    Number.isFinite(quote.low) && Number.isFinite(previous.low) && quote.low < previous.low;

  return {
    intervalHigh: madeNewHigh ? Math.max(price, quote.high) : price,
    intervalLow: madeNewLow ? Math.min(price, quote.low) : price,
    isFirstOfSession: false,
    sessionDate,
  };
}

/**
 * Persists a quote and returns the observation the alert evaluator consumes.
 *
 * @returns {Promise<{previous: object|null, current: object, sample: {price: number|null, intervalHigh: number|null, intervalLow: number|null}, isFirstOfSession: boolean}>}
 */
export async function recordObservation({ stockId, symbol, quote, client }) {
  const previous = await latestPriceRepository.findByStockId(stockId, client);
  const sessionDate = exchangeDate(quote.timestamp ? new Date(quote.timestamp) : new Date());
  const interval = deriveInterval(previous, quote, { sessionDate });

  const current = await latestPriceRepository.upsert(
    {
      ...quote,
      stockId,
      symbol,
      intervalHigh: interval.intervalHigh,
      intervalLow: interval.intervalLow,
      sessionDate: interval.sessionDate,
      observations: interval.isFirstOfSession ? 1 : (previous?.observations ?? 0) + 1,
    },
    client,
  );

  if (interval.intervalLow !== null && interval.intervalLow < quote.price) {
    logger.debug(
      { symbol, low: interval.intervalLow, last: quote.price },
      'Interval low below last trade',
    );
  }

  return {
    previous,
    current,
    isFirstOfSession: interval.isFirstOfSession,
    sample: {
      price: quote.price,
      intervalHigh: interval.intervalHigh,
      intervalLow: interval.intervalLow,
    },
  };
}

export default { deriveInterval, recordObservation };
