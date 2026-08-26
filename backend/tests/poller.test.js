import { beforeEach, describe, expect, it, vi } from 'vitest';

// Everything below the poller is mocked so the test can assert the properties
// that matter: one provider request per unique symbol, one symbol's failure not
// stopping the others, interval extremes reaching the evaluator, corporate
// actions suspending rules, and closed markets costing nothing.

const state = vi.hoisted(() => ({
  activeSymbols: [],
  rulesByStock: new Map(),
  storedPrices: new Map(),
  quoteCalls: [],
  createdAlerts: [],
  latch: [],
  suspensions: [],
  clearedExtremes: [],
  quoteImpl: null,
  now: new Date('2026-08-21T17:00:00Z'), // 13:00 ET, regular session
}));

vi.mock('../src/db/pool.js', () => ({
  pool: { on: vi.fn() },
  query: vi.fn(),
  queryOne: vi.fn(),
  withTransaction: vi.fn(async (fn) => fn({ query: vi.fn().mockResolvedValue({ rows: [] }) })),
  ping: vi.fn(),
  closePool: vi.fn(),
  default: {},
}));

vi.mock('../src/db/repositories/stockRepository.js', () => {
  const impl = { findActiveSymbols: async () => state.activeSymbols };
  return { ...impl, default: impl };
});

vi.mock('../src/db/repositories/latestPriceRepository.js', () => {
  const impl = {
    findByStockId: async (stockId) => state.storedPrices.get(stockId) ?? null,
    upsert: async (row) => {
      state.storedPrices.set(row.stockId, row);
      return row;
    },
    clearIntervalExtremes: async (stockId) => {
      state.clearedExtremes.push(stockId);
    },
    findBySymbol: vi.fn(),
  };
  return { ...impl, default: impl };
});

vi.mock('../src/db/repositories/alertRuleRepository.js', () => {
  const impl = {
    findEnabledByStockId: async (stockId) =>
      (state.rulesByStock.get(stockId) ?? []).filter((r) => r.enabled && !r.suspendedAt),
    setLatchState: async (id, patch) => {
      state.latch.push({ id, ...patch });
    },
    suspendByStockId: async (stockId, reason) => {
      const rules = (state.rulesByStock.get(stockId) ?? []).filter((r) => !r.suspendedAt);
      rules.forEach((r) => {
        r.suspendedAt = new Date();
        r.suspendedReason = reason;
      });
      state.suspensions.push({ stockId, reason, count: rules.length });
      return rules;
    },
  };
  return { ...impl, default: impl };
});

vi.mock('../src/db/repositories/alertRepository.js', () => {
  const impl = {
    create: async (alert) => {
      state.createdAlerts.push(alert);
      return { id: state.createdAlerts.length, ...alert };
    },
  };
  return { ...impl, default: impl };
});

vi.mock('../src/services/finnhub/quoteService.js', () => {
  const impl = {
    getQuote: async (symbol) => {
      state.quoteCalls.push(symbol);
      if (state.quoteImpl) return state.quoteImpl(symbol);
      return {
        symbol,
        price: 100,
        high: 101,
        low: 99,
        previousClose: 100,
        timestamp: state.now.toISOString(),
      };
    },
  };
  return { ...impl, default: impl };
});

const { runPollCycle, getPollerStatus } = await import('../src/jobs/poller.js');

const buyBelow = (id, userId, threshold) => ({
  id,
  userId,
  stockId: 7,
  symbol: 'AAPL',
  type: 'BUY',
  condition: 'BELOW',
  threshold,
  enabled: true,
  triggered: false,
  suspendedAt: null,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(state.now);

  state.activeSymbols = [];
  state.rulesByStock = new Map();
  state.storedPrices = new Map();
  state.quoteCalls = [];
  state.createdAlerts = [];
  state.latch = [];
  state.suspensions = [];
  state.clearedExtremes = [];
  state.quoteImpl = null;
});

describe('runPollCycle — deduplication and resilience', () => {
  it('does nothing when nobody watches anything', async () => {
    const result = await runPollCycle();
    expect(result).toMatchObject({ symbols: 0, alertsCreated: 0 });
    expect(state.quoteCalls).toEqual([]);
  });

  it('fetches each unique symbol exactly once, however many rules reference it', async () => {
    state.activeSymbols = [{ id: 7, symbol: 'AAPL' }];
    state.rulesByStock.set(7, [buyBelow(1, 1, 200), buyBelow(2, 2, 150), {
      ...buyBelow(3, 3, 90),
      type: 'SELL',
      condition: 'ABOVE',
    }]);

    const result = await runPollCycle();

    expect(state.quoteCalls).toEqual(['AAPL']);
    expect(result.alertsCreated).toBe(3);
    expect(state.createdAlerts.map((a) => a.userId).sort()).toEqual([1, 2, 3]);
  });

  it('keeps polling other symbols after one provider failure', async () => {
    state.activeSymbols = [
      { id: 1, symbol: 'AAPL' },
      { id: 2, symbol: 'BROKEN' },
      { id: 3, symbol: 'MSFT' },
    ];
    state.quoteImpl = (symbol) => {
      if (symbol === 'BROKEN') throw new Error('provider exploded');
      return { symbol, price: 100, high: 101, low: 99, previousClose: 100, timestamp: null };
    };

    const result = await runPollCycle();

    expect(state.quoteCalls.sort()).toEqual(['AAPL', 'BROKEN', 'MSFT']);
    expect(result).toMatchObject({ symbols: 3, failures: 1 });
  });

  it('exposes the last run in the status used by the readiness probe', async () => {
    state.activeSymbols = [{ id: 7, symbol: 'AAPL' }];
    await runPollCycle();

    const status = getPollerStatus();
    expect(status.runs).toBeGreaterThan(0);
    expect(status.lastSymbolCount).toBe(1);
    expect(status.lastSession).toBe('open');
  });
});

describe('runPollCycle — interval extremes', () => {
  it('catches a threshold crossing that reversed between two polls', async () => {
    state.activeSymbols = [{ id: 7, symbol: 'AAPL' }];
    state.rulesByStock.set(7, [buyBelow(1, 1, 200)]);

    // First poll: 207, session low 205. Nothing triggers.
    state.quoteImpl = () => ({
      symbol: 'AAPL', price: 207, high: 210, low: 205, previousClose: 206,
      timestamp: state.now.toISOString(),
    });
    await runPollCycle();
    expect(state.createdAlerts).toHaveLength(0);

    // Second poll: back at 207, but the session low is now 195 — it traded
    // through $200 in between.
    state.quoteImpl = () => ({
      symbol: 'AAPL', price: 207, high: 210, low: 195, previousClose: 206,
      timestamp: state.now.toISOString(),
    });
    await runPollCycle();

    expect(state.createdAlerts).toHaveLength(1);
    expect(state.createdAlerts[0]).toMatchObject({
      triggerPrice: 195,
      triggerKind: 'INTERVAL_LOW',
      kind: 'THRESHOLD',
    });
    // Price is back above the line, so the rule re-arms rather than latching.
    expect(state.latch.at(-1)).toMatchObject({ id: 1, triggered: false });
  });

  it('does not use the session range on the first observation of the day', async () => {
    state.activeSymbols = [{ id: 7, symbol: 'AAPL' }];
    state.rulesByStock.set(7, [buyBelow(1, 1, 200)]);

    // A rule written mid-session must not fire on a low that happened earlier.
    state.quoteImpl = () => ({
      symbol: 'AAPL', price: 207, high: 240, low: 180, previousClose: 206,
      timestamp: state.now.toISOString(),
    });
    await runPollCycle();

    expect(state.createdAlerts).toHaveLength(0);
  });
});

describe('runPollCycle — corporate actions', () => {
  beforeEach(() => {
    state.activeSymbols = [{ id: 7, symbol: 'AAPL' }];
    state.rulesByStock.set(7, [buyBelow(1, 1, 700), buyBelow(2, 2, 750)]);
    state.storedPrices.set(7, {
      stockId: 7, symbol: 'AAPL', price: 800, high: 805, low: 795,
      sessionDate: '2026-08-20', observations: 4,
    });
  });

  it('suspends rules and notifies each owner instead of firing on a split', async () => {
    // 4-for-1 split: the provider's previous close is a quarter of what we stored.
    state.quoteImpl = () => ({
      symbol: 'AAPL', price: 201, high: 203, low: 199, previousClose: 200,
      timestamp: state.now.toISOString(),
    });

    await runPollCycle();

    expect(state.suspensions).toEqual([
      { stockId: 7, reason: 'suspected 4-for-1 split', count: 2 },
    ]);
    // No threshold alerts — only one system notice per affected owner.
    const kinds = state.createdAlerts.map((a) => a.kind);
    expect(kinds).toEqual(['SYSTEM', 'SYSTEM']);
    expect(state.createdAlerts[0].message).toMatch(/4-for-1 split/);
    expect(state.clearedExtremes).toEqual([7]);
  });

  it('fires normally through a genuine overnight gap', async () => {
    // Same drop, but the previous close matches what we stored: real news.
    state.quoteImpl = () => ({
      symbol: 'AAPL', price: 690, high: 700, low: 685, previousClose: 800,
      timestamp: state.now.toISOString(),
    });

    await runPollCycle();

    expect(state.suspensions).toEqual([]);
    expect(state.createdAlerts.map((a) => a.kind)).toEqual(['THRESHOLD', 'THRESHOLD']);
  });
});

describe('runPollCycle — market hours', () => {
  it('skips the cycle on a weekend, spending no provider quota', async () => {
    vi.setSystemTime(new Date('2026-08-22T17:00:00Z')); // Saturday
    state.activeSymbols = [{ id: 7, symbol: 'AAPL' }];

    const result = await runPollCycle();

    expect(result).toMatchObject({ skipped: true, reason: 'weekend' });
    expect(state.quoteCalls).toEqual([]);
    expect(getPollerStatus().skippedCycles).toBeGreaterThan(0);
  });

  it('skips on an exchange holiday and says which one', async () => {
    vi.setSystemTime(new Date('2026-11-26T17:00:00Z')); // Thanksgiving
    state.activeSymbols = [{ id: 7, symbol: 'AAPL' }];

    const result = await runPollCycle();

    expect(result.reason).toBe('holiday: Thanksgiving Day');
    expect(state.quoteCalls).toEqual([]);
  });

  it('skips overnight', async () => {
    vi.setSystemTime(new Date('2026-08-21T06:00:00Z')); // 02:00 ET
    state.activeSymbols = [{ id: 7, symbol: 'AAPL' }];

    expect(await runPollCycle()).toMatchObject({ skipped: true, reason: 'outside trading hours' });
    expect(state.quoteCalls).toEqual([]);
  });

  it('polls during extended hours, when gaps happen', async () => {
    vi.setSystemTime(new Date('2026-08-21T12:00:00Z')); // 08:00 ET, pre-market
    state.activeSymbols = [{ id: 7, symbol: 'AAPL' }];

    await runPollCycle();
    expect(state.quoteCalls).toEqual(['AAPL']);
  });

  it('can be forced to run regardless, for manual checks', async () => {
    vi.setSystemTime(new Date('2026-08-22T17:00:00Z')); // Saturday
    state.activeSymbols = [{ id: 7, symbol: 'AAPL' }];

    await runPollCycle({ force: true });
    expect(state.quoteCalls).toEqual(['AAPL']);
  });
});
