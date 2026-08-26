/**
 * Risk, expressed in numbers a beginner can act on.
 *
 * Everything here is computed from candles the app already fetches, so it costs
 * no extra provider calls. The metrics are deliberately the ones people
 * underestimate — how much a stock moves on an ordinary day, and how far it fell
 * from a peak — rather than the ones that look sophisticated.
 */

const round = (value, decimals = 2) => {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** Percentage change between consecutive closes. */
function dailyReturns(points) {
  const returns = [];
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1].close;
    const current = points[i].close;
    if (Number.isFinite(previous) && Number.isFinite(current) && previous > 0) {
      returns.push((current - previous) / previous);
    }
  }
  return returns;
}

/**
 * The worst peak-to-trough fall inside the window.
 *
 * This is the number that answers "what would this have felt like if I'd bought
 * at the wrong moment", which is the question a beginner never thinks to ask.
 */
export function maxDrawdown(points) {
  let peak = null;
  let peakPoint = null;
  let worst = { percent: 0, peak: null, trough: null };

  for (const point of points) {
    if (!Number.isFinite(point.close)) continue;

    if (peak === null || point.close > peak) {
      peak = point.close;
      peakPoint = point;
      continue;
    }

    const decline = (point.close - peak) / peak;
    if (decline < worst.percent) {
      worst = { percent: decline, peak: peakPoint, trough: point };
    }
  }

  if (!worst.peak || !worst.trough) return null;

  return {
    percent: round(worst.percent * 100),
    peakPrice: round(worst.peak.close, 4),
    peakAt: worst.peak.time,
    troughPrice: round(worst.trough.close, 4),
    troughAt: worst.trough.time,
    // How long the fall took, which is often as instructive as its size.
    days: Math.max(
      1,
      Math.round((new Date(worst.trough.time) - new Date(worst.peak.time)) / 86_400_000),
    ),
  };
}

/**
 * @param {{points: Array, granularity: string}} candles
 * @param {{positionValue?: number}} options size to express the risk against
 */
export function computeRiskMetrics(candles, { positionValue = 1000 } = {}) {
  const points = (candles?.points ?? []).filter((point) => Number.isFinite(point.close));
  if (points.length < 3) return null;

  const returns = dailyReturns(points);
  if (returns.length === 0) return null;

  const absolute = returns.map(Math.abs);
  const typicalMove = absolute.reduce((sum, value) => sum + value, 0) / absolute.length;
  const worstDay = Math.min(...returns);
  const bestDay = Math.max(...returns);

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, returns.length - 1);
  const stdDev = Math.sqrt(variance);

  const first = points[0].close;
  const last = points[points.length - 1].close;

  // Intraday range where the provider gave high/low, which is a more honest
  // "how much does this move" than close-to-close alone.
  const ranges = points
    .filter((point) => Number.isFinite(point.high) && Number.isFinite(point.low) && point.close > 0)
    .map((point) => (point.high - point.low) / point.close);
  const typicalRange = ranges.length > 0 ? ranges.reduce((s, v) => s + v, 0) / ranges.length : null;

  // Only per-bar data is annualised, and only when the bars are daily.
  const barsPerYear = { day: 252, week: 52, month: 12 }[candles.granularity] ?? null;

  return {
    granularity: candles.granularity,
    bars: points.length,
    from: points[0].time,
    to: points[points.length - 1].time,

    typicalMovePercent: round(typicalMove * 100),
    typicalRangePercent: typicalRange === null ? null : round(typicalRange * 100),
    volatilityPercent: round(stdDev * 100),
    annualizedVolatilityPercent: barsPerYear ? round(stdDev * Math.sqrt(barsPerYear) * 100) : null,

    worstBarPercent: round(worstDay * 100),
    bestBarPercent: round(bestDay * 100),
    windowReturnPercent: first > 0 ? round(((last - first) / first) * 100) : null,

    maxDrawdown: maxDrawdown(points),

    // The whole point: what that volatility means in money.
    positionValue,
    typicalDailySwing: round(typicalMove * positionValue),
    worstBarLoss: round(Math.abs(worstDay) * positionValue),
    drawdownLoss: (() => {
      const drawdown = maxDrawdown(points);
      return drawdown ? round((Math.abs(drawdown.percent) / 100) * positionValue) : null;
    })(),

    // A rough bucket, used only to choose plain-language wording in the UI.
    band: (() => {
      const daily = typicalMove * 100;
      if (daily < 1) return 'steady';
      if (daily < 2) return 'normal';
      if (daily < 4) return 'lively';
      return 'wild';
    })(),
  };
}

export default { computeRiskMetrics, maxDrawdown };
