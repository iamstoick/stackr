import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-not-used-in-production',
      FINNHUB_API_KEY: 'test-finnhub-key',
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      POLL_ENABLED: 'false',
      LOG_LEVEL: 'silent',
      // HTTP tests assert per-request provider behaviour, so the candle cache
      // is off here; its own behaviour is covered by candleCache.test.js.
      CANDLE_CACHE_TTL_MS: '0',
    },
    restoreMocks: true,
  },
});
