import pinoHttp from 'pino-http';

import logger from '../utils/logger.js';

/**
 * HTTP request logging. Health probes are dropped to keep the log readable,
 * and the serializers emit only non-sensitive request metadata.
 */
export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url?.startsWith('/health/'),
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({ method: req.method, url: req.url, ip: req.remoteAddress }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});

export default requestLogger;
