import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

// In Docker the environment is injected by compose; locally we read the repo
// root .env so the backend and compose share a single source of truth.
//
// Test runs deliberately skip both files: a suite that picks up the developer's
// real keys would make live provider calls and pass or fail depending on whose
// machine it runs on.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: path.join(repoRoot, '.env'), quiet: true });
  dotenv.config({ path: path.join(repoRoot, 'backend/.env'), quiet: true, override: true });
}

const bool = (defaultValue) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? defaultValue : v.toLowerCase() === 'true'));

const int = (defaultValue) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? defaultValue : Number(v)))
    .refine((v) => Number.isFinite(v), { message: 'must be a number' });

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v.trim()));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: int(3000),
  LOG_LEVEL: z.string().default('info'),

  FRONTEND_URL: z.string().default('http://localhost:8080'),
  BACKEND_URL: z.string().default('http://localhost:8080'),

  DATABASE_URL: optionalString,

  FINNHUB_API_KEY: optionalString,
  FINNHUB_BASE_URL: z.string().default('https://finnhub.io/api/v1'),
  FINNHUB_TIMEOUT_MS: int(8000),

  // Twelve Data serves historical candles, which Finnhub gates behind a paid
  // plan. Quotes, search and profiles stay on Finnhub.
  TWELVEDATA_API_KEY: optionalString,
  TWELVEDATA_BASE_URL: z.string().default('https://api.twelvedata.com'),
  TWELVEDATA_TIMEOUT_MS: int(10_000),
  // Extended-hours bars are a paid feature and the provider caps them at 30min
  // intervals, so this stays off unless the plan supports it.
  TWELVEDATA_PREPOST: bool(false),
  CANDLE_PROVIDER: z.enum(['auto', 'twelvedata', 'finnhub']).default('auto'),
  CANDLE_CACHE_TTL_MS: int(300_000),
  CANDLE_CACHE_MAX_ENTRIES: int(500),

  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,

  JWT_SECRET: optionalString,
  JWT_EXPIRES_IN: z.string().default('7d'),
  COOKIE_NAME: z.string().default('sm_token'),

  // Every 5 minutes: frequent enough for threshold alerts, easy on the
  // provider's request quota.
  POLL_CRON: z.string().default('*/5 * * * *'),
  POLL_ENABLED: bool(true),
  POLL_CONCURRENCY: int(4),
  // Nothing trades overnight, at weekends or on exchange holidays.
  POLL_SKIP_WHEN_CLOSED: bool(true),

  // Notification delivery. An alert nobody receives is only a log entry.
  NOTIFY_ENABLED: bool(true),
  NOTIFY_CRON: z.string().default('* * * * *'),
  NOTIFY_MAX_ATTEMPTS: int(4),
  NOTIFY_BATCH_SIZE: int(50),
  SMTP_URL: optionalString,
  MAIL_FROM: optionalString,

  // Paper trading. Costs are modelled rather than ignored: a simulator that
  // fills at the mid price for free teaches a beginner the wrong lesson.
  PAPER_STARTING_CASH: int(10_000),
  PAPER_COMMISSION: int(0),
  PAPER_SPREAD_BPS: int(3),
  PAPER_MAX_ORDER_VALUE: int(1_000_000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // Cannot use the logger here: it depends on this module.
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

const env = parsed.data;
const isProduction = env.NODE_ENV === 'production';
const isTest = env.NODE_ENV === 'test';

// Hard requirements: without these the process cannot serve anything useful.
const hardFailures = [];
if (!env.DATABASE_URL && !isTest) hardFailures.push('DATABASE_URL');
if (!env.JWT_SECRET && isProduction) hardFailures.push('JWT_SECRET');

if (hardFailures.length > 0) {
  console.error(
    `Missing required environment variables: ${hardFailures.join(', ')}. ` +
      'Copy .env.example to .env and fill them in.',
  );
  process.exit(1);
}

// Outside production an ephemeral secret keeps `docker compose up` working
// before credentials exist; sessions simply do not survive a restart.
let jwtSecret = env.JWT_SECRET;
let jwtSecretIsEphemeral = false;
if (!jwtSecret) {
  jwtSecret = crypto.randomBytes(48).toString('base64');
  jwtSecretIsEphemeral = true;
}

// Feature gates: missing third-party credentials degrade a feature instead of
// crashing the process, so the app still boots and reports why.
const features = {
  googleOAuth: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  finnhub: Boolean(env.FINNHUB_API_KEY),
  twelveData: Boolean(env.TWELVEDATA_API_KEY),
  // Webhooks need no server-side credentials, so that channel is always
  // available; email only works once SMTP is configured.
  emailNotifications: Boolean(env.SMTP_URL),
  webhookNotifications: env.NOTIFY_ENABLED,
};

/**
 * Which provider serves historical candles. `auto` prefers Twelve Data when a
 * key exists, because Finnhub's candle endpoint needs a paid plan.
 */
function resolveCandleProvider() {
  if (env.CANDLE_PROVIDER === 'twelvedata') return 'twelvedata';
  if (env.CANDLE_PROVIDER === 'finnhub') return 'finnhub';
  return features.twelveData ? 'twelvedata' : 'finnhub';
}

export const config = {
  env: env.NODE_ENV,
  isProduction,
  isTest,
  port: env.PORT,
  logLevel: env.LOG_LEVEL,

  frontendUrl: env.FRONTEND_URL.replace(/\/$/, ''),
  backendUrl: env.BACKEND_URL.replace(/\/$/, ''),

  database: {
    url: env.DATABASE_URL,
  },

  finnhub: {
    apiKey: env.FINNHUB_API_KEY,
    baseUrl: env.FINNHUB_BASE_URL.replace(/\/$/, ''),
    timeoutMs: env.FINNHUB_TIMEOUT_MS,
  },

  twelveData: {
    apiKey: env.TWELVEDATA_API_KEY,
    baseUrl: env.TWELVEDATA_BASE_URL.replace(/\/$/, ''),
    timeoutMs: env.TWELVEDATA_TIMEOUT_MS,
    prepost: env.TWELVEDATA_PREPOST,
  },

  market: {
    candleProvider: resolveCandleProvider(),
    candleProviderSetting: env.CANDLE_PROVIDER,
    candleCacheTtlMs: Math.max(0, env.CANDLE_CACHE_TTL_MS),
    candleCacheMaxEntries: Math.max(1, env.CANDLE_CACHE_MAX_ENTRIES),
  },

  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    get callbackUrl() {
      return `${env.BACKEND_URL.replace(/\/$/, '')}/api/auth/google/callback`;
    },
  },

  jwt: {
    secret: jwtSecret,
    secretIsEphemeral: jwtSecretIsEphemeral,
    expiresIn: env.JWT_EXPIRES_IN,
    cookieName: env.COOKIE_NAME,
  },

  poller: {
    cron: env.POLL_CRON,
    enabled: env.POLL_ENABLED,
    concurrency: Math.max(1, env.POLL_CONCURRENCY),
    skipWhenClosed: env.POLL_SKIP_WHEN_CLOSED,
  },

  paper: {
    startingCash: Math.max(1, env.PAPER_STARTING_CASH),
    commission: Math.max(0, env.PAPER_COMMISSION),
    spreadBps: Math.max(0, env.PAPER_SPREAD_BPS),
    maxOrderValue: Math.max(1, env.PAPER_MAX_ORDER_VALUE),
  },

  notifications: {
    enabled: env.NOTIFY_ENABLED,
    cron: env.NOTIFY_CRON,
    maxAttempts: Math.max(1, env.NOTIFY_MAX_ATTEMPTS),
    batchSize: Math.max(1, env.NOTIFY_BATCH_SIZE),
    smtpUrl: env.SMTP_URL,
    mailFrom: env.MAIL_FROM ?? 'Stackr <alerts@localhost>',
  },

  features,
};

/** Config gaps that make the service not-ready rather than not-alive. */
export function readinessConfigIssues() {
  const issues = [];
  if (!config.features.finnhub) issues.push('FINNHUB_API_KEY is not configured');
  if (config.market.candleProvider === 'twelvedata' && !config.features.twelveData) {
    issues.push('CANDLE_PROVIDER=twelvedata but TWELVEDATA_API_KEY is not configured');
  }
  if (!config.features.googleOAuth) {
    issues.push('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured');
  }
  if (config.jwt.secretIsEphemeral) issues.push('JWT_SECRET is not configured (using ephemeral key)');
  return issues;
}

export default config;
