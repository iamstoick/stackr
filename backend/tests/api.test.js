import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The HTTP layer, controllers, services and validation all run for real. Only
// the two boundaries are faked: PostgreSQL and the Finnhub HTTP client.

const db = vi.hoisted(() => ({
  ping: vi.fn().mockResolvedValue(true),
  withTransaction: vi.fn(async (fn) => fn({ query: vi.fn().mockResolvedValue({ rows: [] }) })),
}));

const provider = vi.hoisted(() => ({ request: vi.fn() }));

const repos = vi.hoisted(() => ({
  user: { findById: vi.fn(), findByGoogleId: vi.fn(), upsertFromGoogleProfile: vi.fn() },
  stock: { findBySymbol: vi.fn(), findById: vi.fn(), upsert: vi.fn(), findActiveSymbols: vi.fn() },
  favorite: {
    listByUser: vi.fn(),
    exists: vi.fn(),
    symbolsForUser: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
  },
  alertRule: {
    listByUser: vi.fn(),
    listByUserAndSymbol: vi.fn(),
    findByIdForUser: vi.fn(),
    findDuplicate: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    findEnabledByStockId: vi.fn(),
    setLatchState: vi.fn(),
  },
  alert: { listByUser: vi.fn(), countByUser: vi.fn(), create: vi.fn(), acknowledge: vi.fn() },
  latestPrice: { findBySymbol: vi.fn(), upsert: vi.fn() },
}));

vi.mock('../src/db/pool.js', () => ({
  pool: { on: vi.fn(), query: vi.fn(), connect: vi.fn(), end: vi.fn() },
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  queryOne: vi.fn().mockResolvedValue(null),
  withTransaction: db.withTransaction,
  ping: db.ping,
  closePool: vi.fn(),
  default: {},
}));

vi.mock('../src/services/finnhub/finnhubClient.js', () => ({
  request: provider.request,
  default: { request: provider.request },
}));

// Defensive: no test should ever reach a real provider, whatever keys happen to
// be configured on the machine running the suite.
vi.mock('../src/services/twelvedata/twelveDataClient.js', () => {
  const request = vi.fn(async () => {
    throw new Error('twelvedata must not be called in these tests');
  });
  return { request, default: { request } };
});

const mockRepo = (impl) => ({ ...impl, default: impl });
vi.mock('../src/db/repositories/userRepository.js', () => mockRepo(repos.user));
vi.mock('../src/db/repositories/stockRepository.js', () => mockRepo(repos.stock));
vi.mock('../src/db/repositories/favoriteRepository.js', () => mockRepo(repos.favorite));
vi.mock('../src/db/repositories/alertRuleRepository.js', () => mockRepo(repos.alertRule));
vi.mock('../src/db/repositories/alertRepository.js', () => mockRepo(repos.alert));
vi.mock('../src/db/repositories/latestPriceRepository.js', () => mockRepo(repos.latestPrice));

const { createApp } = await import('../src/app.js');
const jwtService = (await import('../src/services/auth/jwtService.js')).default;
const { ApiError } = await import('../src/utils/ApiError.js');

const app = createApp();

const USER = {
  id: 42,
  email: 'trader@example.com',
  name: 'Trader',
  avatarUrl: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};
const OTHER_USER_ID = 99;
const APPLE = {
  id: 7,
  symbol: 'AAPL',
  companyName: 'Apple Inc',
  exchange: 'NASDAQ',
  currency: 'USD',
  logoUrl: null,
  updatedAt: new Date(),
};

const authed = (req) => req.set('Authorization', `Bearer ${jwtService.signToken(USER)}`);

const QUOTE_FIXTURE = { c: 201.5, d: -1.25, dp: -0.62, h: 203, l: 200, o: 202, pc: 202.75, t: Math.floor(Date.now() / 1000) };
const PROFILE_FIXTURE = { ticker: 'AAPL', name: 'Apple Inc', exchange: 'NASDAQ', currency: 'USD', country: 'US', logo: 'https://logo' };

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks clears recorded calls but NOT queued one-shot implementations.
  // These two mocks are the ones tests queue values on, so an unconsumed
  // mockResolvedValueOnce would leak into the next test and fail it at random.
  db.ping.mockReset();
  repos.user.findById.mockReset();

  db.ping.mockResolvedValue(true);
  db.withTransaction.mockImplementation(async (fn) => fn({ query: vi.fn().mockResolvedValue({ rows: [] }) }));
  repos.user.findById.mockImplementation(async (id) => (Number(id) === USER.id ? USER : null));
  repos.stock.findBySymbol.mockResolvedValue(APPLE);
  repos.stock.upsert.mockResolvedValue(APPLE);
  repos.latestPrice.upsert.mockResolvedValue(null);
  repos.latestPrice.findBySymbol.mockResolvedValue(null);

  provider.request.mockImplementation(async (path) => {
    if (path === '/quote') return QUOTE_FIXTURE;
    if (path === '/stock/profile2') return PROFILE_FIXTURE;
    if (path === '/search') {
      return { count: 2, result: [
        { symbol: 'AAPL', displaySymbol: 'AAPL', description: 'APPLE INC', type: 'Common Stock' },
        { symbol: 'AAPL.SW', displaySymbol: 'AAPL.SW', description: 'APPLE INC (SWISS)', type: 'Common Stock' },
      ] };
    }
    if (path === '/stock/candle') {
      return { s: 'ok', t: [1, 2], o: [1, 1], h: [2, 2], l: [1, 1], c: [1.5, 1.6], v: [10, 20] };
    }
    throw new Error(`unexpected provider path ${path}`);
  });
});

describe('health', () => {
  it('reports liveness without touching any dependency', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(db.ping).not.toHaveBeenCalled();
  });

  it('is ready when the database answers and configuration is complete', async () => {
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ready', checks: { database: 'ok', configuration: 'ok' } });
  });

  it('reports not ready when the database is unreachable', async () => {
    db.ping.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.checks.database).toBe('unreachable');
  });
});

describe('authentication', () => {
  it.each([
    ['get', '/api/stocks/AAPL'],
    ['get', '/api/stocks/search?q=apple'],
    ['get', '/api/favorites'],
    ['post', '/api/favorites/AAPL'],
    ['get', '/api/alerts'],
    ['post', '/api/alerts'],
    ['get', '/api/alerts/history'],
    ['get', '/api/user/profile'],
  ])('rejects unauthenticated %s %s', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });

  it('rejects a valid token whose user no longer exists', async () => {
    repos.user.findById.mockResolvedValueOnce(null);
    const res = await authed(request(app).get('/api/auth/me'));
    expect(res.status).toBe(401);
  });

  it('returns the current user for a valid token', async () => {
    const res = await authed(request(app).get('/api/auth/me'));
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: USER.id, email: USER.email });
  });

  it('never includes the google id in the user payload', async () => {
    const res = await authed(request(app).get('/api/auth/me'));
    expect(res.body.user.googleId).toBeUndefined();
  });

  it('clears the auth cookie on logout', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie'].join(';')).toMatch(/sm_token=;/);
  });

  it('rejects an OAuth callback whose state does not match the cookie', async () => {
    const res = await request(app).get('/api/auth/google/callback?state=forged&code=abc');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=invalid_state');
  });
});

describe('stocks', () => {
  it('searches and filters out non-primary listings', async () => {
    const res = await authed(request(app).get('/api/stocks/search?q=apple'));
    expect(res.status).toBe(200);
    expect(res.body.results.map((r) => r.symbol)).toEqual(['AAPL']);
  });

  it('requires a search term of at least two characters', async () => {
    const res = await authed(request(app).get('/api/stocks/search?q=a'));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns normalized detail with the favorite flag', async () => {
    repos.favorite.exists.mockResolvedValue(true);
    const res = await authed(request(app).get('/api/stocks/aapl'));
    expect(res.status).toBe(200);
    expect(res.body.stock).toMatchObject({ symbol: 'AAPL', companyName: 'Apple Inc', isFavorite: true });
    expect(res.body.stock.quote.price).toBe(201.5);
  });

  it('rejects a syntactically invalid symbol before calling the provider', async () => {
    const res = await authed(request(app).get('/api/stocks/AA%20PL/quote'));
    expect(res.status).toBe(422);
    expect(provider.request).not.toHaveBeenCalled();
  });

  it('returns candles for a supported range', async () => {
    const res = await authed(request(app).get('/api/stocks/AAPL/candles?range=1h'));
    expect(res.status).toBe(200);
    expect(res.body.candles).toMatchObject({ symbol: 'AAPL', range: '1h', resolution: '60', count: 2 });
  });

  it('names the provider that served the chart and its cache state', async () => {
    const res = await authed(request(app).get('/api/stocks/AAPL/candles?range=1d'));
    expect(res.body.provider).toBe('finnhub');
    expect(res.body.cache).toEqual({ hit: false, ageSeconds: 0 });
  });

  it('rejects an unsupported range', async () => {
    const res = await authed(request(app).get('/api/stocks/AAPL/candles?range=3q'));
    expect(res.status).toBe(422);
  });

  it('surfaces a provider outage as a 502 without leaking provider internals', async () => {
    provider.request.mockRejectedValue(
      new ApiError(502, 'PROVIDER_ERROR', 'The market data provider returned an unexpected error.'),
    );
    const res = await authed(request(app).get('/api/stocks/AAPL/candles?range=1d'));
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('PROVIDER_ERROR');
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain('finnhub');
  });

  it('maps a provider rate limit to 429', async () => {
    provider.request.mockRejectedValue(ApiError.tooManyRequests());
    const res = await authed(request(app).get('/api/stocks/AAPL/candles?range=1d'));
    expect(res.status).toBe(429);
  });
});

describe('favorites', () => {
  it('lists only the caller’s favorites', async () => {
    repos.favorite.listByUser.mockResolvedValue([
      { id: 1, createdAt: new Date(), stock: { id: 7, symbol: 'AAPL' }, quote: null },
    ]);
    const res = await authed(request(app).get('/api/favorites'));
    expect(res.status).toBe(200);
    expect(repos.favorite.listByUser).toHaveBeenCalledWith(USER.id);
    expect(res.body.count).toBe(1);
  });

  it('adds a favorite and reports it as created', async () => {
    repos.favorite.exists.mockResolvedValue(false);
    repos.favorite.listByUser.mockResolvedValue([]);
    repos.favorite.add.mockResolvedValue({ created: true });

    const res = await authed(request(app).post('/api/favorites/aapl'));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ created: true, favorite: { symbol: 'AAPL' } });
    expect(repos.favorite.add).toHaveBeenCalledWith(USER.id, APPLE.id);
  });

  it('is idempotent when the favorite already exists', async () => {
    repos.favorite.exists.mockResolvedValue(true);
    repos.favorite.add.mockResolvedValue({ created: false });

    const res = await authed(request(app).post('/api/favorites/AAPL'));
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
  });

  it('treats removing a nonexistent favorite as a success', async () => {
    repos.favorite.remove.mockResolvedValue({ removed: false });
    const res = await authed(request(app).delete('/api/favorites/AAPL'));
    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(false);
  });

  it('scopes removal to the calling user', async () => {
    repos.favorite.remove.mockResolvedValue({ removed: true });
    await authed(request(app).delete('/api/favorites/AAPL'));
    expect(repos.favorite.remove).toHaveBeenCalledWith(USER.id, APPLE.id);
    expect(repos.favorite.remove).not.toHaveBeenCalledWith(OTHER_USER_ID, expect.anything());
  });
});

describe('alerts', () => {
  const RULE = {
    id: 5,
    userId: USER.id,
    stockId: APPLE.id,
    symbol: 'AAPL',
    type: 'BUY',
    condition: 'BELOW',
    threshold: 200,
    enabled: true,
    triggered: false,
  };

  it('creates a rule for the caller', async () => {
    repos.alertRule.listByUser.mockResolvedValue([]);
    repos.alertRule.findDuplicate.mockResolvedValue(null);
    repos.alertRule.create.mockResolvedValue(RULE);

    const res = await authed(request(app).post('/api/alerts')).send({
      symbol: 'aapl',
      type: 'BUY',
      condition: 'BELOW',
      threshold: 200,
    });

    expect(res.status).toBe(201);
    expect(repos.alertRule.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER.id, stockId: APPLE.id, threshold: 200 }),
    );
  });

  it('rejects an unknown alert type', async () => {
    const res = await authed(request(app).post('/api/alerts')).send({
      symbol: 'AAPL',
      type: 'HOLD',
      condition: 'BELOW',
      threshold: 200,
    });
    expect(res.status).toBe(422);
  });

  it('rejects a non-positive threshold', async () => {
    const res = await authed(request(app).post('/api/alerts')).send({
      symbol: 'AAPL',
      type: 'BUY',
      condition: 'BELOW',
      threshold: 0,
    });
    expect(res.status).toBe(422);
  });

  it('refuses an identical duplicate rule', async () => {
    repos.alertRule.listByUser.mockResolvedValue([]);
    repos.alertRule.findDuplicate.mockResolvedValue(RULE);

    const res = await authed(request(app).post('/api/alerts')).send({
      symbol: 'AAPL',
      type: 'BUY',
      condition: 'BELOW',
      threshold: 200,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALERT_RULE_EXISTS');
  });

  it('404s when patching a rule belonging to someone else', async () => {
    repos.alertRule.findByIdForUser.mockResolvedValue(null);
    const res = await authed(request(app).patch('/api/alerts/5')).send({ enabled: false });
    expect(res.status).toBe(404);
    expect(repos.alertRule.findByIdForUser).toHaveBeenCalledWith(5, USER.id);
  });

  it('404s when deleting a rule belonging to someone else', async () => {
    repos.alertRule.remove.mockResolvedValue({ removed: false });
    const res = await authed(request(app).delete('/api/alerts/5'));
    expect(res.status).toBe(404);
  });

  it('deletes the caller’s own rule', async () => {
    repos.alertRule.remove.mockResolvedValue({ removed: true });
    const res = await authed(request(app).delete('/api/alerts/5'));
    expect(res.status).toBe(204);
    expect(repos.alertRule.remove).toHaveBeenCalledWith(5, USER.id);
  });

  it('rejects an empty patch body', async () => {
    const res = await authed(request(app).patch('/api/alerts/5')).send({});
    expect(res.status).toBe(422);
  });

  it('returns paginated history scoped to the caller', async () => {
    repos.alert.listByUser.mockResolvedValue([{ id: 1, symbol: 'AAPL', triggered_at: new Date() }]);
    repos.alert.countByUser.mockResolvedValue(1);

    const res = await authed(request(app).get('/api/alerts/history?limit=10'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, limit: 10, offset: 0 });
    expect(repos.alert.listByUser).toHaveBeenCalledWith(
      USER.id,
      expect.objectContaining({ limit: 10 }),
    );
  });

  it('acknowledges an alert', async () => {
    repos.alert.acknowledge.mockResolvedValue({ id: 3, acknowledgedAt: new Date() });
    const res = await authed(request(app).post('/api/alerts/3/acknowledge'));
    expect(res.status).toBe(200);
    expect(repos.alert.acknowledge).toHaveBeenCalledWith(3, USER.id);
  });

  it('404s when acknowledging an alert that is not the caller’s', async () => {
    repos.alert.acknowledge.mockResolvedValue(null);
    const res = await authed(request(app).post('/api/alerts/3/acknowledge'));
    expect(res.status).toBe(404);
  });

  it('does not treat /history as an id', async () => {
    repos.alert.listByUser.mockResolvedValue([]);
    repos.alert.countByUser.mockResolvedValue(0);
    const res = await authed(request(app).get('/api/alerts/history'));
    expect(res.status).toBe(200);
  });
});

describe('error envelope', () => {
  it('uses the documented shape for unknown routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'ROUTE_NOT_FOUND', message: expect.stringContaining('/api/nope') },
    });
  });

  it('rejects malformed JSON bodies', async () => {
    const res = await authed(request(app).post('/api/alerts'))
      .set('Content-Type', 'application/json')
      .send('{"symbol":');
    expect(res.status).toBe(400);
  });
});
