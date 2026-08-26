import { describe, expect, it } from 'vitest';

import { normalizeTimeSeries } from '../src/services/twelvedata/candleService.js';
import { resolveRange } from '../src/services/market/rangeMapper.js';

const dailyRange = resolveRange('1d', 1_700_000_000);
const minuteRange = resolveRange('1m', 1_700_000_000);

describe('rangeMapper — Twelve Data intervals', () => {
  it('maps every UI range to a valid Twelve Data interval', () => {
    const valid = new Set(['1min', '5min', '15min', '30min', '45min', '1h', '2h', '4h', '1day', '1week', '1month']);
    for (const key of ['1m', '1h', '1d', '1w', '1mo', '1y']) {
      expect(valid.has(resolveRange(key).interval)).toBe(true);
    }
  });

  it('keeps the Finnhub resolution alongside the Twelve Data interval', () => {
    const range = resolveRange('1h');
    expect(range.resolution).toBe('60');
    expect(range.interval).toBe('1h');
  });
});

describe('normalizeTimeSeries', () => {
  it('reverses the provider’s newest-first order into chart order', () => {
    const result = normalizeTimeSeries('aapl', {
      meta: { symbol: 'AAPL', interval: '1day', currency: 'USD', exchange: 'NASDAQ' },
      values: [
        { datetime: '2026-08-21', open: '202.0', high: '204.0', low: '201.0', close: '203.5', volume: '41230000' },
        { datetime: '2026-08-20', open: '200.0', high: '203.0', low: '199.5', close: '202.4', volume: '38120000' },
      ],
      status: 'ok',
    }, dailyRange);

    expect(result.count).toBe(2);
    expect(result.points[0].time).toBe('2026-08-20T00:00:00.000Z');
    expect(result.points[1].time).toBe('2026-08-21T00:00:00.000Z');
    expect(result.points[0].timestamp).toBeLessThan(result.points[1].timestamp);
  });

  it('parses the provider’s strings into numbers', () => {
    const result = normalizeTimeSeries('AAPL', {
      values: [{ datetime: '2026-08-21', open: '202.0', high: '204.0', low: '201.0', close: '203.5', volume: '41230000' }],
    }, dailyRange);

    expect(result.points[0]).toMatchObject({
      open: 202, high: 204, low: 201, close: 203.5, volume: 41230000,
    });
  });

  it('treats intraday datetimes as UTC', () => {
    const result = normalizeTimeSeries('AAPL', {
      values: [{ datetime: '2026-08-21 15:59:00', open: '1', high: '1', low: '1', close: '1', volume: '0' }],
    }, minuteRange);

    expect(result.points[0].time).toBe('2026-08-21T15:59:00.000Z');
  });

  it('produces the same envelope the Finnhub service produces', () => {
    const result = normalizeTimeSeries('AAPL', { values: [] }, dailyRange);
    expect(Object.keys(result).sort()).toEqual(
      ['count', 'currency', 'exchange', 'from', 'granularity', 'points', 'provider', 'range', 'resolution', 'symbol', 'to'],
    );
    expect(result.provider).toBe('twelvedata');
  });

  it('returns an empty series rather than throwing on a missing body', () => {
    expect(normalizeTimeSeries('AAPL', null, dailyRange).count).toBe(0);
    expect(normalizeTimeSeries('AAPL', { values: 'nope' }, dailyRange).points).toEqual([]);
  });

  it('drops rows with an unusable datetime or close', () => {
    const result = normalizeTimeSeries('AAPL', {
      values: [
        { datetime: 'not-a-date', close: '1' },
        { datetime: '2026-08-21', close: null },
        { datetime: '2026-08-22', close: '5' },
      ],
    }, dailyRange);

    expect(result.count).toBe(1);
    expect(result.points[0].close).toBe(5);
  });
});
