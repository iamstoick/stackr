import { describe, expect, it } from 'vitest';

import { normalizeCandles } from '../src/services/finnhub/candleService.js';
import { normalizeQuote } from '../src/services/finnhub/quoteService.js';
import { RANGE_KEYS, resolveRange } from '../src/services/market/rangeMapper.js';

describe('resolveRange', () => {
  it('supports every timeframe the UI offers', () => {
    expect(RANGE_KEYS).toEqual(['1m', '1h', '1d', '1w', '1mo', '1y']);
  });

  it('maps UI ranges to provider resolutions and a matching window', () => {
    const now = 1_700_000_000;
    expect(resolveRange('1m', now)).toMatchObject({ resolution: '1', to: now });
    expect(resolveRange('1h', now).resolution).toBe('60');
    expect(resolveRange('1d', now).resolution).toBe('D');
    expect(resolveRange('1w', now).resolution).toBe('W');
    expect(resolveRange('1mo', now).resolution).toBe('M');
    expect(resolveRange('1y', now).resolution).toBe('M');
  });

  it('gives coarser resolutions a longer lookback window', () => {
    const now = 1_700_000_000;
    const minuteSpan = now - resolveRange('1m', now).from;
    const yearSpan = now - resolveRange('1y', now).from;
    expect(yearSpan).toBeGreaterThan(minuteSpan);
  });

  it('is case-insensitive and defaults to the daily view', () => {
    expect(resolveRange('1MO').key).toBe('1mo');
    expect(resolveRange().key).toBe('1d');
  });

  it('rejects an unknown range with a 400', () => {
    expect(() => resolveRange('7q')).toThrowError(/Unsupported range/);
    try {
      resolveRange('7q');
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });
});

describe('normalizeQuote', () => {
  it('renames the provider’s single-letter fields', () => {
    const quote = normalizeQuote('aapl', { c: 201.5, d: -1.25, dp: -0.62, h: 203, l: 200, o: 202, pc: 202.75, t: 1_700_000_000 });
    expect(quote).toMatchObject({
      symbol: 'AAPL',
      price: 201.5,
      change: -1.25,
      changePercent: -0.62,
      previousClose: 202.75,
    });
    expect(quote.timestamp).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('nulls out non-numeric or absent values instead of passing them through', () => {
    expect(normalizeQuote('AAPL', {})).toMatchObject({ price: null, timestamp: null });
    expect(normalizeQuote('AAPL', { c: 'oops' }).price).toBe(null);
  });
});

describe('normalizeCandles', () => {
  const range = resolveRange('1d', 1_700_000_000);

  it('pivots column arrays into chart-ready points', () => {
    const result = normalizeCandles('aapl', {
      s: 'ok',
      t: [1_699_900_000, 1_699_990_000],
      o: [1, 2],
      h: [3, 4],
      l: [0.5, 1.5],
      c: [2.5, 3.5],
      v: [100, 200],
    }, range);

    expect(result.symbol).toBe('AAPL');
    expect(result.count).toBe(2);
    expect(result.points[0]).toMatchObject({ open: 1, high: 3, low: 0.5, close: 2.5, volume: 100 });
    expect(result.points[1].time).toBe(new Date(1_699_990_000_000).toISOString());
  });

  it('returns an empty series for a no_data response rather than throwing', () => {
    const result = normalizeCandles('AAPL', { s: 'no_data' }, range);
    expect(result.count).toBe(0);
    expect(result.points).toEqual([]);
  });
});
