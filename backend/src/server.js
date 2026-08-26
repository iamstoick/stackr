import { createApp } from './app.js';
import config from './config/env.js';
import { closePool, ping } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { startScheduler, stopScheduler } from './jobs/index.js';
import logger from './utils/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function waitForDatabase({ attempts = 15, delayMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await ping();
      return;
    } catch (err) {
      if (attempt === attempts) throw err;
      logger.warn({ attempt, attempts }, 'Database not ready yet; retrying');
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main() {
  logger.info(
    { env: config.env, features: config.features },
    'Starting Stackr backend',
  );

  await waitForDatabase();
  await runMigrations();

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'HTTP server listening');
  });

  startScheduler();

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');

    // Force-exit guard so a stuck connection cannot block the container forever.
    const force = setTimeout(() => {
      logger.error('Graceful shutdown timed out; exiting');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    force.unref();

    try {
      await stopScheduler();
      await new Promise((resolve) => server.close(resolve));
      await closePool();
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception; exiting');
    process.exit(1);
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
