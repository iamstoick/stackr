import { beforeEach, describe, expect, it, vi } from 'vitest';

// The provider chain is decided by configuration, so config is mocked here to
// exercise each combination without touching the environment.

const state = vi.hoisted(() => ({
  features: { twelveData: true, finnhub: true },
  market: {
    candleProvider: 'twelvedata',
    candleProviderSetting: 'auto',
    candleCacheTtlMs: 0, // caching is covered by candleCache.test.js
    candleCacheMaxEntries: 100,
  },
}));

vi.mock('../src/config/env.js', () => {
  const config = {
    env: 'test',
    isProduction: false,
    isTest: true,
    logLevel: 'silent',
    get features() {
      return state.features;
    },
    get market() {
      return state.market;
    },
  };
  return { config, default: config, readinessConfigIssues: () => [] };
});

const services = vi.hoisted(() => ({
  twelvedata: { getCandles: vi.fn() },
  finnhub: { getCandles: vi.fn() },
}));

vi.mock('../src/services/twelvedata/candleService.js', () => ({
  ...services.twelvedata,
  default: services.twelvedata,
}));
vi.mock('../src/services/finnhub/candleService.js', () => ({
  ...services.finnhub,
  default: services.finnhub,
}));

const { candleProviderChain, getCandles } = await import('../src/services/market/candleProvider.js');
const { ApiError } = await import('../src/utils/ApiError.js');

const payload = (provider) => ({ symbol: 'AAPL', provider, count: 1, points: [] });

beforeEach(() => {
  vi.clearAllMocks();
  state.features = { twelveData: true, finnhub: true };
  state.market = { ...state.market, candleProvider: 'twelvedata', candleProviderSetting: 'auto' };
  services.twelvedata.getCandles.mockResolvedValue(payload('twelvedata'));
  services.finnhub.getCandles.mockResolvedValue(payload('finnhub'));
});

describe('candleProviderChain', () => {
  it('prefers Twelve Data on auto, since Finnhub gates candles behind a paid plan', () => {
    expect(candleProviderChain().map((p) => p.name)).toEqual(['twelvedata', 'finnhub']);
  });

  it('falls back to Finnhub alone when no Twelve Data key is set', () => {
    state.features = { twelveData: false, finnhub: true };
    state.market = { ...state.market, candleProvider: 'finnhub' };
    expect(candleProviderChain().map((p) => p.name)).toEqual(['finnhub']);
  });

  it('honours an explicit provider and disables fallback', () => {
    state.market = { ...state.market, candleProviderSetting: 'finnhub' };
    expect(candleProviderChain().map((p) => p.name)).toEqual(['finnhub']);
  });
});

describe('getCandles', () => {
  it('serves from the preferred provider without touching the other', async () => {
    const result = await getCandles('AAPL', '1d');
    expect(result.provider).toBe('twelvedata');
    expect(services.finnhub.getCandles).not.toHaveBeenCalled();
  });

  it('falls back to Finnhub when Twelve Data denies access', async () => {
    services.twelvedata.getCandles.mockRejectedValue(
      new ApiError(502, 'PROVIDER_ACCESS_DENIED', 'nope'),
    );

    const result = await getCandles('AAPL', '1d');
    expect(result.provider).toBe('finnhub');
  });

  it('does not fall back on a real data error, so failures stay visible', async () => {
    services.twelvedata.getCandles.mockRejectedValue(
      ApiError.notFound('STOCK_NOT_FOUND', 'no such symbol'),
    );

    await expect(getCandles('NOPE', '1d')).rejects.toMatchObject({ code: 'STOCK_NOT_FOUND' });
    expect(services.finnhub.getCandles).not.toHaveBeenCalled();
  });

  it('does not fall back when a provider is pinned', async () => {
    state.market = { ...state.market, candleProviderSetting: 'twelvedata' };
    services.twelvedata.getCandles.mockRejectedValue(
      new ApiError(502, 'PROVIDER_ACCESS_DENIED', 'nope'),
    );

    await expect(getCandles('AAPL', '1d')).rejects.toMatchObject({ code: 'PROVIDER_ACCESS_DENIED' });
    expect(services.finnhub.getCandles).not.toHaveBeenCalled();
  });

  it('explains itself when no provider is configured at all', async () => {
    state.features = { twelveData: false, finnhub: false };
    state.market = { ...state.market, candleProvider: 'twelvedata' };

    await expect(getCandles('AAPL', '1d')).rejects.toMatchObject({
      code: 'PROVIDER_NOT_CONFIGURED',
      status: 503,
    });
  });
});
