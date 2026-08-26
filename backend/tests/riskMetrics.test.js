import { describe, expect, it } from 'vitest';

import { computeRiskMetrics, maxDrawdown } from '../src/services/market/riskMetrics.js';

const series = (closes, { granularity = 'day' } = {}) => ({
  granularity,
  points: closes.map((close, index) => ({
    time: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    close,
    high: close * 1.01,
    low: close * 0.99,
  })),
});

describe('maxDrawdown', () => {
  it('finds the worst peak-to-trough fall, not the first or the last', () => {
    // Rises to 120, falls to 90 (−25%), recovers, then dips only 10% later.
    const result = maxDrawdown(series([100, 120, 110, 90, 130, 117]).points);

    expect(result.percent).toBe(-25);
    expect(result.peakPrice).toBe(120);
    expect(result.troughPrice).toBe(90);
  });

  it('reports how long the fall took', () => {
    const result = maxDrawdown(series([100, 120, 110, 90]).points);
    expect(result.days).toBe(2);
  });

  it('returns null for a series that only rises', () => {
    expect(maxDrawdown(series([100, 101, 102]).points)).toBe(null);
  });
});

describe('computeRiskMetrics', () => {
  it('measures the typical daily move', () => {
    // Alternating ±2% moves: the typical absolute move is about 2%.
    const metrics = computeRiskMetrics(series([100, 102, 100, 102, 100]));
    expect(metrics.typicalMovePercent).toBeGreaterThan(1.9);
    expect(metrics.typicalMovePercent).toBeLessThan(2.1);
  });

  it('translates volatility into money for a position size', () => {
    const metrics = computeRiskMetrics(series([100, 102, 100, 102, 100]), {
      positionValue: 5000,
    });
    // ~2% of $5,000 is about $100 of daily swing.
    expect(metrics.typicalDailySwing).toBeGreaterThan(90);
    expect(metrics.typicalDailySwing).toBeLessThan(110);
    expect(metrics.positionValue).toBe(5000);
  });

  it('reports what the worst drawdown would have cost on that size', () => {
    const metrics = computeRiskMetrics(series([100, 120, 90, 130]), { positionValue: 1000 });
    expect(metrics.maxDrawdown.percent).toBe(-25);
    expect(metrics.drawdownLoss).toBe(250);
  });

  it('bands a quiet stock and a wild one differently', () => {
    const quiet = computeRiskMetrics(series([100, 100.3, 100.1, 100.4, 100.2]));
    const wild = computeRiskMetrics(series([100, 108, 96, 110, 95]));

    expect(quiet.band).toBe('steady');
    expect(wild.band).toBe('wild');
  });

  it('annualises volatility only for daily, weekly or monthly bars', () => {
    expect(computeRiskMetrics(series([100, 102, 100, 103])).annualizedVolatilityPercent).toBeGreaterThan(0);
    expect(
      computeRiskMetrics(series([100, 102, 100, 103], { granularity: 'minute' }))
        .annualizedVolatilityPercent,
    ).toBe(null);
  });

  it('reports best and worst single bars', () => {
    const metrics = computeRiskMetrics(series([100, 90, 99]));
    expect(metrics.worstBarPercent).toBe(-10);
    expect(metrics.bestBarPercent).toBe(10);
  });

  it('returns null rather than nonsense for a series too short to measure', () => {
    expect(computeRiskMetrics(series([100]))).toBe(null);
    expect(computeRiskMetrics({ points: [] })).toBe(null);
    expect(computeRiskMetrics(null)).toBe(null);
  });

  it('ignores gaps in the data instead of treating them as moves', () => {
    const withHoles = {
      granularity: 'day',
      points: [
        { time: '2026-01-01T00:00:00Z', close: 100 },
        { time: '2026-01-02T00:00:00Z', close: null },
        { time: '2026-01-03T00:00:00Z', close: 102 },
        { time: '2026-01-04T00:00:00Z', close: null },
        { time: '2026-01-05T00:00:00Z', close: 104 },
      ],
    };
    const metrics = computeRiskMetrics(withHoles);

    expect(metrics.bars).toBe(3);
    // A null close must not read as a 100% drop and back.
    expect(metrics.typicalMovePercent).toBeGreaterThan(1.9);
    expect(metrics.typicalMovePercent).toBeLessThan(2.1);
  });

  it('needs at least three usable closes before reporting anything', () => {
    // Two points give one return, which cannot support a volatility figure —
    // better to say nothing than to publish a meaningless zero.
    const twoUsable = {
      granularity: 'day',
      points: [
        { time: '2026-01-01T00:00:00Z', close: 100 },
        { time: '2026-01-02T00:00:00Z', close: null },
        { time: '2026-01-03T00:00:00Z', close: 102 },
      ],
    };
    expect(computeRiskMetrics(twoUsable)).toBe(null);
  });
});
