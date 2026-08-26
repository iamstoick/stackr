import pino from 'pino';

import config from '../config/env.js';

// Anything matching these paths is stripped before a log line is written, so
// tokens, keys and secrets can never reach the log stream by accident.
const redactPaths = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.jwt',
  '*.apiKey',
  '*.api_key',
  '*.client_secret',
  '*.clientSecret',
  'config.finnhub.apiKey',
  'config.jwt.secret',
];

export const logger = pino({
  level: config.isTest ? 'silent' : config.logLevel,
  redact: { paths: redactPaths, censor: '[redacted]' },
  base: { service: 'stackr-backend' },
  formatters: {
    level: (label) => ({ level: label }),
  },
  transport: config.isProduction
    ? undefined
    : {
        target: 'pino/file',
        options: { destination: 1 },
      },
});

export default logger;
