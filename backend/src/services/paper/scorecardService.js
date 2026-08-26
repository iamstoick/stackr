import portfolioRepository from '../../db/repositories/portfolioRepository.js';
import logger from '../../utils/logger.js';
import candleProvider from '../market/candleProvider.js';
import paperTradingService from './paperTradingService.js';

/**
 * The learner's own results, against the only benchmark that matters: doing
 * nothing.
 *
 * This is the most useful thing the simulator can tell someone, and the thing an
 * engagement-driven app would bury. Most retail traders underperform a broad
 * index, and costs plus timing are why. Showing it from the user's own trades is
 * far more persuasive than saying it.
 */

const BENCHMARK_SYMBOL = 'SPY';
const BENCHMARK_LABEL = 'S&P 500 (SPY)';

const round = (value, decimals = 2) => {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** Coarsest range that still covers the account's lifetime. */
function rangeForAge(days) {
  if (days <= 80) return '1d'; // daily bars, 90 days
  if (days <= 350) return '1w'; // weekly bars, 1 year
  return '1mo'; // monthly bars, 5 years
}

/** Close nearest to (and not before) a date, else the earliest available. */
function closeAt(points, isoDate) {
  const target = new Date(isoDate).getTime();
  const onOrAfter = points.find((point) => new Date(point.time).getTime() >= target);
  return onOrAfter ?? points[0] ?? null;
}

/**
 * @returns benchmark return over the same period, or null when unavailable —
 * the scorecard degrades to the user's own numbers rather than failing.
 */
async function benchmarkReturn(since) {
  const ageDays = Math.max(1, (Date.now() - new Date(since).getTime()) / 86_400_000);

  try {
    const candles = await candleProvider.getCandles(BENCHMARK_SYMBOL, rangeForAge(ageDays));
    const points = (candles.points ?? []).filter((point) => Number.isFinite(point.close));
    if (points.length < 2) return null;

    const start = closeAt(points, since);
    const end = points[points.length - 1];
    if (!start || !end || start.close <= 0) return null;

    return {
      symbol: BENCHMARK_SYMBOL,
      label: BENCHMARK_LABEL,
      startPrice: round(start.close, 4),
      startAt: start.time,
      endPrice: round(end.close, 4),
      endAt: end.time,
      returnPercent: round(((end.close - start.close) / start.close) * 100),
    };
  } catch (err) {
    logger.warn({ err }, 'Benchmark comparison unavailable');
    return null;
  }
}

/**
 * The learner's scorecard: their return, the benchmark's over the same window,
 * what costs took, and how active they have been.
 */
export async function getScorecard(userId) {
  const [{ portfolio, positions }, firstTrade, snapshots] = await Promise.all([
    paperTradingService.getPortfolio(userId),
    portfolioRepository.firstTradeAt(userId),
    portfolioRepository.listEquitySnapshots(userId, 180),
  ]);

  const since = firstTrade ?? portfolio.openedAt;
  const daysActive = Math.max(1, Math.round((Date.now() - new Date(since).getTime()) / 86_400_000));

  const benchmark = portfolio.tradeCount > 0 ? await benchmarkReturn(since) : null;

  const yourReturnPercent = portfolio.totalReturnPercent;
  const difference =
    benchmark && Number.isFinite(benchmark.returnPercent)
      ? round(yourReturnPercent - benchmark.returnPercent)
      : null;

  // Had they put the same starting cash into the index and left it alone.
  const buyAndHoldEquity =
    benchmark && Number.isFinite(benchmark.returnPercent)
      ? round(portfolio.startingCash * (1 + benchmark.returnPercent / 100), 2)
      : null;

  return {
    since,
    daysActive,
    tradesPerMonth: round((portfolio.tradeCount / daysActive) * 30, 1),

    you: {
      startingCash: portfolio.startingCash,
      equity: portfolio.equity,
      returnPercent: yourReturnPercent,
      realizedPnl: portfolio.realizedPnl,
      unrealizedPnl: portfolio.unrealizedPnl,
      tradeCount: portfolio.tradeCount,
      costsPaid: portfolio.totalCostsPaid,
      costDragPercent: portfolio.costDragPercent,
      positionCount: positions.length,
      largestAllocationPercent: positions[0]?.allocationPercent ?? 0,
    },

    benchmark,
    buyAndHoldEquity,
    differencePercent: difference,
    verdict: difference === null ? 'unknown' : difference >= 0 ? 'ahead' : 'behind',

    // Concrete observations the UI turns into plain sentences. Descriptive, never
    // a recommendation to buy or sell anything.
    observations: buildObservations({ portfolio, positions, difference, daysActive }),

    equityCurve: snapshots,
  };
}

function buildObservations({ portfolio, positions, difference, daysActive }) {
  const observations = [];

  if (portfolio.tradeCount === 0) {
    observations.push({
      id: 'no-trades',
      tone: 'neutral',
      text: 'You have not placed a simulated trade yet. Buying something is the fastest way to see how a position behaves.',
    });
    return observations;
  }

  if (portfolio.totalCostsPaid > 0) {
    observations.push({
      id: 'costs',
      tone: portfolio.costDragPercent > 1 ? 'warn' : 'neutral',
      text: `Costs have taken $${portfolio.totalCostsPaid.toFixed(2)} — ${portfolio.costDragPercent}% of what you started with. Every trade pays the spread twice: once getting in, once getting out.`,
    });
  }

  const tradesPerMonth = (portfolio.tradeCount / daysActive) * 30;
  if (tradesPerMonth > 20) {
    observations.push({
      id: 'activity',
      tone: 'warn',
      text: `You are averaging about ${Math.round(tradesPerMonth)} trades a month. Frequent trading multiplies costs and, in study after study, tends to lower returns rather than raise them.`,
    });
  }

  if (positions.length === 1 && positions[0].allocationPercent > 60) {
    observations.push({
      id: 'concentration',
      tone: 'warn',
      text: `${positions[0].allocationPercent}% of your portfolio is in ${positions[0].symbol}. A single company's bad day is your whole portfolio's bad day.`,
    });
  } else if (positions.length > 0 && positions[0].allocationPercent > 40) {
    observations.push({
      id: 'concentration-soft',
      tone: 'neutral',
      text: `Your largest holding, ${positions[0].symbol}, is ${positions[0].allocationPercent}% of the portfolio. Concentration raises both the upside and the damage.`,
    });
  }

  if (difference !== null) {
    observations.push({
      id: 'benchmark',
      tone: difference >= 0 ? 'good' : 'warn',
      text:
        difference >= 0
          ? `You are ${Math.abs(difference)}% ahead of simply holding the index over the same period. Worth knowing: over short windows, luck explains most of a gap this size.`
          : `You are ${Math.abs(difference)}% behind simply holding the index over the same period. That is the usual result, and it is the reason index funds are the default advice.`,
    });
  }

  if (portfolio.cashPercent > 90 && portfolio.tradeCount > 0) {
    observations.push({
      id: 'cash',
      tone: 'neutral',
      text: `You are ${portfolio.cashPercent}% in cash. Cash is a position too — it earns nothing here, but it also cannot fall.`,
    });
  }

  return observations;
}

export default { getScorecard };
