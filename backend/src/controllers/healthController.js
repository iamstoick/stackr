import config, { readinessConfigIssues } from '../config/env.js';
import { ping } from '../db/pool.js';
import { getPollerStatus } from '../jobs/poller.js';
import notificationRepository from '../db/repositories/notificationRepository.js';
import { candleCache } from '../services/market/candleProvider.js';
import { getDispatcherStatus } from '../services/notifications/notificationService.js';
import asyncHandler from '../utils/asyncHandler.js';

const startedAt = Date.now();

/** GET /health — liveness. Cheap, no dependencies, never fails while running. */
export function live(_req, res) {
  res.json({
    status: 'ok',
    service: 'stackr-backend',
    env: config.env,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  });
}

/** GET /health/ready — readiness: database reachable and configuration usable. */
export const ready = asyncHandler(async (_req, res) => {
  const checks = { database: 'ok', configuration: 'ok' };
  let status = 'ready';

  try {
    await ping();
  } catch {
    checks.database = 'unreachable';
    status = 'not_ready';
  }

  const configIssues = readinessConfigIssues();
  if (configIssues.length > 0) {
    checks.configuration = 'incomplete';
    status = 'not_ready';
  }

  // A backed-up delivery queue does not make the service unready, but it is the
  // first thing to look at when alerts stop arriving.
  let deliveryQueue = null;
  if (checks.database === 'ok') {
    deliveryQueue = await notificationRepository.queueDepth().catch(() => null);
  }

  res.status(status === 'ready' ? 200 : 503).json({
    status,
    checks,
    configIssues,
    features: config.features,
    providers: { quotes: 'finnhub', candles: config.market.candleProvider },
    poller: getPollerStatus(),
    notifications: { ...getDispatcherStatus(), queue: deliveryQueue },
    candleCache: candleCache.getStats(),
  });
});

export default { live, ready };
