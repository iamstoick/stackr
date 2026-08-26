import config from '../config/env.js';
import latestPriceRepository from '../db/repositories/latestPriceRepository.js';
import portfolioRepository from '../db/repositories/portfolioRepository.js';
import stockRepository from '../db/repositories/stockRepository.js';
import alertService from '../services/alerts/alertService.js';
import quoteService from '../services/finnhub/quoteService.js';
import corporateActionGuard from '../services/market/corporateActionGuard.js';
import { exchangeDate, marketSession } from '../services/market/marketCalendar.js';
import priceObserver from '../services/market/priceObserver.js';
import logger from '../utils/logger.js';

const status = {
  running: false,
  lastRunAt: null,
  lastDurationMs: null,
  lastSymbolCount: 0,
  lastAlertCount: 0,
  lastFailureCount: 0,
  lastSession: null,
  lastSkipReason: null,
  lastError: null,
  runs: 0,
  skippedCycles: 0,
  skippedOverlaps: 0,
  suspensions: 0,
};

export function getPollerStatus() {
  return {
    ...status,
    enabled: config.poller.enabled,
    cron: config.poller.cron,
    skipWhenClosed: config.poller.skipWhenClosed,
  };
}

/**
 * Runs `worker` over `items` with a bounded number of in-flight requests, so a
 * large watchlist cannot burst past the provider's rate limit.
 */
async function mapWithConcurrency(items, limit, worker) {
  const results = [];
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * Polls one symbol: fetch the quote once, record the observation (which derives
 * the price range covered since the last poll), guard against corporate actions,
 * then evaluate every user's rules against that single observation.
 */
async function pollSymbol({ id, symbol }, context) {
  const quote = await quoteService.getQuote(symbol);
  const previous = await latestPriceRepository.findByStockId(id);

  // Check before writing: the guard compares what we stored last against the
  // provider's current previous close.
  const detection = corporateActionGuard.detectCorporateAction(previous, quote);
  if (detection) {
    const { suspended } = await alertService.suspendRulesForStock({
      stockId: id,
      symbol,
      reason: detection.reason,
      notice: corporateActionGuard.buildNotice(symbol, detection),
    });
    status.suspensions += suspended;

    // Store the new price, but throw away extremes measured against the old
    // series and skip evaluation for this cycle.
    await priceObserver.recordObservation({ stockId: id, symbol, quote });
    await latestPriceRepository.clearIntervalExtremes(id);
    return { alerts: 0, suspended };
  }

  const { sample } = await priceObserver.recordObservation({ stockId: id, symbol, quote });
  const created = await alertService.evaluateForStock({ stockId: id, symbol, sample, context });
  return { alerts: created.length, suspended: 0 };
}

/**
 * One polling pass:
 *   1. collect the distinct symbols anyone is watching or alerting on
 *   2. fetch each symbol's quote exactly once
 *   3. persist it, deriving the interval high/low since the previous poll
 *   4. evaluate every user's rules for that symbol against that one observation
 *
 * Deduplication happens in step 1 (SQL DISTINCT): 500 users watching AAPL still
 * cost a single provider request. A failure on one symbol never stops the rest.
 */
export async function runPollCycle({ force = false } = {}) {
  if (status.running) {
    status.skippedOverlaps += 1;
    logger.warn('Skipping poll cycle: previous cycle is still running');
    return { skipped: true, reason: 'overlap' };
  }

  const session = marketSession();
  status.lastSession = session.session;

  // Nothing trades overnight, at weekends or on holidays, so a cycle then would
  // spend provider quota re-reading a price that cannot have changed.
  if (!force && config.poller.skipWhenClosed && !session.isTradingDay) {
    status.skippedCycles += 1;
    status.lastSkipReason = session.holiday ? `holiday: ${session.holiday}` : session.session;
    logger.debug({ session: session.session, holiday: session.holiday }, 'Market closed; skipping poll cycle');
    return { skipped: true, reason: status.lastSkipReason };
  }
  if (!force && config.poller.skipWhenClosed && session.session === 'closed') {
    status.skippedCycles += 1;
    status.lastSkipReason = 'outside trading hours';
    logger.debug('Outside trading hours; skipping poll cycle');
    return { skipped: true, reason: status.lastSkipReason };
  }

  status.running = true;
  status.lastSkipReason = null;
  const startedAt = Date.now();
  let alertsCreated = 0;
  let failures = 0;

  try {
    const symbols = await stockRepository.findActiveSymbols();

    if (symbols.length === 0) {
      logger.debug('Poll cycle found no active symbols');
    } else {
      // Rules that opted out of extended hours need to know which session this
      // observation belongs to.
      const evaluationContext = {
        now: new Date(),
        isRegularSession: session.isRegularSession,
      };

      await mapWithConcurrency(symbols, config.poller.concurrency, async (target) => {
        try {
          const { alerts } = await pollSymbol(target, evaluationContext);
          alertsCreated += alerts;
        } catch (err) {
          failures += 1;
          logger.warn(
            { err, symbol: target.symbol },
            'Poll failed for symbol; continuing with the rest',
          );
        }
      });
    }

    // Equity curves are what let a learner see their own results over time, and
    // the prices for it were just written. Idempotent per day, so a failure here
    // never fails the cycle.
    try {
      await portfolioRepository.snapshotAllEquity(exchangeDate());
    } catch (err) {
      logger.warn({ err }, 'Equity snapshot failed');
    }

    status.lastRunAt = new Date().toISOString();
    status.lastDurationMs = Date.now() - startedAt;
    status.lastSymbolCount = symbols.length;
    status.lastAlertCount = alertsCreated;
    status.lastFailureCount = failures;
    status.lastError = null;
    status.runs += 1;

    logger.info(
      {
        symbols: symbols.length,
        failures,
        alertsCreated,
        session: session.session,
        ms: status.lastDurationMs,
      },
      'Poll cycle complete',
    );

    return { symbols: symbols.length, failures, alertsCreated, session: session.session };
  } catch (err) {
    status.lastError = err.message;
    logger.error({ err }, 'Poll cycle failed');
    throw err;
  } finally {
    status.running = false;
  }
}

export default { runPollCycle, getPollerStatus };
