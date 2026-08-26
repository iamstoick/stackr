import pg from 'pg';

import config from '../config/env.js';
import logger from '../utils/logger.js';

const { Pool } = pg;

// Return NUMERIC as a JS number. All numeric columns here are prices and
// percentages that comfortably fit in a double.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) =>
  value === null ? null : Number.parseFloat(value),
);
pg.types.setTypeParser(pg.types.builtins.INT8, (value) =>
  value === null ? null : Number.parseInt(value, 10),
);

export const pool = new Pool({
  connectionString: config.database.url,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: 'stackr-backend',
});

pool.on('error', (err) => {
  // Idle client blew up; pg replaces it. Log rather than crash the process.
  logger.error({ err }, 'Unexpected PostgreSQL client error');
});

/** Runs a parameterized query. Never interpolate user input into `text`. */
export async function query(text, params) {
  const startedAt = process.hrtime.bigint();
  try {
    const result = await pool.query(text, params);
    if (logger.isLevelEnabled('debug')) {
      const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
      logger.debug({ sql: text.replace(/\s+/g, ' ').trim(), rows: result.rowCount, ms }, 'query');
    }
    return result;
  } catch (err) {
    logger.error(
      { err, sql: text.replace(/\s+/g, ' ').trim().slice(0, 200) },
      'Database query failed',
    );
    throw err;
  }
}

/** First row or null. */
export async function queryOne(text, params) {
  const { rows } = await query(text, params);
  return rows[0] ?? null;
}

/**
 * Runs `fn` inside a transaction, passing a client whose `query` is bound to
 * that connection. Commits on resolve, rolls back on throw.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error({ err: rollbackErr }, 'Transaction rollback failed');
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function ping() {
  await query('SELECT 1');
  return true;
}

export async function closePool() {
  await pool.end();
}

export default { pool, query, queryOne, withTransaction, ping, closePool };
