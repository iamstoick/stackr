import logger from '../../utils/logger.js';

/**
 * TTL cache for historical candles, keyed by symbol + range.
 *
 * Candles are the most expensive thing this app fetches and the least likely to
 * change within a few minutes, so every viewer of the same chart inside the TTL
 * costs one provider request instead of one each. In-flight requests are shared
 * too (single-flight), which matters because Twelve Data's free plan allows only
 * 8 requests a minute — a burst of chart loads would otherwise trip it.
 *
 * Deliberately in-process: a single API container needs no Redis for this, and
 * the whole cache is disposable. Adding Redis later means replacing this module,
 * not its callers.
 */
export class CandleCache {
  constructor({ ttlMs = 300_000, maxEntries = 500, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
    this.entries = new Map();
    this.inFlight = new Map();
    this.stats = { hits: 0, misses: 0, shared: 0, evictions: 0, expired: 0 };
  }

  static key(symbol, range) {
    return `${String(symbol).toUpperCase()}:${String(range).toLowerCase()}`;
  }

  /** Oldest-first eviction; insertion order is Map's own iteration order. */
  #evictIfFull() {
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) return;
      this.entries.delete(oldest);
      this.stats.evictions += 1;
    }
  }

  get(symbol, range) {
    const key = CandleCache.key(symbol, range);
    const entry = this.entries.get(key);
    if (!entry) return null;

    const age = this.now() - entry.storedAt;
    if (age >= this.ttlMs) {
      this.entries.delete(key);
      this.stats.expired += 1;
      return null;
    }

    return { value: entry.value, storedAt: entry.storedAt, ageMs: age };
  }

  set(symbol, range, value) {
    const key = CandleCache.key(symbol, range);
    this.entries.delete(key);
    this.#evictIfFull();
    this.entries.set(key, { value, storedAt: this.now() });
    return value;
  }

  /**
   * Returns the cached candles, or calls `loader` once and shares that single
   * call with every concurrent caller for the same key.
   */
  async resolve(symbol, range, loader) {
    const key = CandleCache.key(symbol, range);

    const cached = this.get(symbol, range);
    if (cached) {
      this.stats.hits += 1;
      return { ...cached.value, cache: { hit: true, ageSeconds: Math.round(cached.ageMs / 1000) } };
    }

    const pending = this.inFlight.get(key);
    if (pending) {
      this.stats.shared += 1;
      const value = await pending;
      return { ...value, cache: { hit: true, ageSeconds: 0 } };
    }

    this.stats.misses += 1;
    const request = (async () => {
      try {
        const value = await loader();
        this.set(symbol, range, value);
        return value;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, request);
    const value = await request;
    return { ...value, cache: { hit: false, ageSeconds: 0 } };
  }

  clear() {
    this.entries.clear();
    logger.debug('Candle cache cleared');
  }

  getStats() {
    const lookups = this.stats.hits + this.stats.misses + this.stats.shared;
    return {
      entries: this.entries.size,
      maxEntries: this.maxEntries,
      ttlSeconds: Math.round(this.ttlMs / 1000),
      ...this.stats,
      hitRate: lookups === 0 ? null : Number(((this.stats.hits + this.stats.shared) / lookups).toFixed(3)),
    };
  }
}

export default CandleCache;
