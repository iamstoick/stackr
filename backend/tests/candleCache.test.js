import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CandleCache } from '../src/services/market/candleCache.js';

let clock;
const newCache = (options = {}) => {
  clock = 1_000_000;
  return new CandleCache({ ttlMs: 300_000, now: () => clock, ...options });
};

const candles = (symbol) => ({ symbol, count: 1, points: [{ close: 1 }] });

describe('CandleCache', () => {
  let cache;
  beforeEach(() => {
    cache = newCache();
  });

  it('calls the loader once and serves the second read from cache', async () => {
    const loader = vi.fn().mockResolvedValue(candles('AAPL'));

    const first = await cache.resolve('AAPL', '1d', loader);
    const second = await cache.resolve('AAPL', '1d', loader);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(first.cache).toEqual({ hit: false, ageSeconds: 0 });
    expect(second.cache.hit).toBe(true);
    expect(second.symbol).toBe('AAPL');
  });

  it('reports the age of a cached entry in seconds', async () => {
    const loader = vi.fn().mockResolvedValue(candles('AAPL'));
    await cache.resolve('AAPL', '1d', loader);

    clock += 90_000;
    const hit = await cache.resolve('AAPL', '1d', loader);

    expect(hit.cache).toEqual({ hit: true, ageSeconds: 90 });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('refetches once the TTL has passed', async () => {
    const loader = vi.fn().mockResolvedValue(candles('AAPL'));
    await cache.resolve('AAPL', '1d', loader);

    clock += 300_000;
    await cache.resolve('AAPL', '1d', loader);

    expect(loader).toHaveBeenCalledTimes(2);
    expect(cache.getStats().expired).toBe(1);
  });

  it('keys on symbol and range separately', async () => {
    const loader = vi.fn().mockImplementation(async () => candles('AAPL'));

    await cache.resolve('AAPL', '1d', loader);
    await cache.resolve('AAPL', '1h', loader);
    await cache.resolve('MSFT', '1d', loader);

    expect(loader).toHaveBeenCalledTimes(3);
  });

  it('normalizes case in the key', async () => {
    const loader = vi.fn().mockResolvedValue(candles('AAPL'));
    await cache.resolve('aapl', '1D', loader);
    await cache.resolve('AAPL', '1d', loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight request between concurrent callers', async () => {
    let release;
    const loader = vi.fn(() => new Promise((resolve) => {
      release = () => resolve(candles('AAPL'));
    }));

    const inFlight = [
      cache.resolve('AAPL', '1d', loader),
      cache.resolve('AAPL', '1d', loader),
      cache.resolve('AAPL', '1d', loader),
    ];
    release();
    const results = await Promise.all(inFlight);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(3);
    expect(cache.getStats().shared).toBe(2);
  });

  it('does not cache a failed load, and lets the next caller retry', async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('provider down'))
      .mockResolvedValueOnce(candles('AAPL'));

    await expect(cache.resolve('AAPL', '1d', loader)).rejects.toThrow('provider down');
    const retry = await cache.resolve('AAPL', '1d', loader);

    expect(loader).toHaveBeenCalledTimes(2);
    expect(retry.symbol).toBe('AAPL');
  });

  it('evicts the oldest entry when full, bounding memory', async () => {
    const small = new CandleCache({ ttlMs: 300_000, maxEntries: 2, now: () => clock });
    const loader = vi.fn().mockResolvedValue(candles('X'));

    await small.resolve('A', '1d', loader);
    await small.resolve('B', '1d', loader);
    await small.resolve('C', '1d', loader);

    expect(small.getStats().entries).toBe(2);
    expect(small.getStats().evictions).toBe(1);
    expect(small.get('A', '1d')).toBe(null); // oldest went first
    expect(small.get('C', '1d')).not.toBe(null);
  });

  it('tracks a hit rate for the readiness probe', async () => {
    const loader = vi.fn().mockResolvedValue(candles('AAPL'));
    await cache.resolve('AAPL', '1d', loader);
    await cache.resolve('AAPL', '1d', loader);

    const stats = cache.getStats();
    expect(stats).toMatchObject({ hits: 1, misses: 1, entries: 1, ttlSeconds: 300 });
    expect(stats.hitRate).toBe(0.5);
  });
});
