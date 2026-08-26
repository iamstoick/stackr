import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import logger from '../utils/logger.js';
import { pool, withTransaction } from './pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Local checkout: backend/src/db -> <repo>/database/migrations.
// Container: MIGRATIONS_DIR points at /app/database/migrations, where compose
// mounts the same directory read-only.
const migrationsDir =
  process.env.MIGRATIONS_DIR || path.resolve(here, '../../../database/migrations');

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT PRIMARY KEY,
    checksum   TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

function checksum(contents) {
  return crypto.createHash('sha256').update(contents).digest('hex');
}

async function readMigrations() {
  const entries = await fs.readdir(migrationsDir);
  const files = entries.filter((f) => f.endsWith('.sql')).sort();
  return Promise.all(
    files.map(async (filename) => ({
      filename,
      sql: await fs.readFile(path.join(migrationsDir, filename), 'utf8'),
    })),
  );
}

/**
 * Applies every not-yet-applied migration in filename order. Each file runs in
 * its own transaction, so a failure leaves earlier migrations committed and the
 * failing one fully rolled back.
 */
export async function runMigrations() {
  await pool.query(CREATE_TABLE);

  const [{ rows: applied }, migrations] = await Promise.all([
    pool.query('SELECT filename, checksum FROM schema_migrations'),
    readMigrations(),
  ]);
  const appliedByName = new Map(applied.map((r) => [r.filename, r.checksum]));

  const results = [];
  for (const migration of migrations) {
    const sum = checksum(migration.sql);
    const previous = appliedByName.get(migration.filename);

    if (previous) {
      if (previous !== sum) {
        throw new Error(
          `Migration ${migration.filename} was modified after being applied. ` +
            'Add a new migration instead of editing an applied one.',
        );
      }
      results.push({ filename: migration.filename, status: 'skipped' });
      continue;
    }

    await withTransaction(async (client) => {
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [
        migration.filename,
        sum,
      ]);
    });
    logger.info({ migration: migration.filename }, 'Applied migration');
    results.push({ filename: migration.filename, status: 'applied' });
  }

  const appliedCount = results.filter((r) => r.status === 'applied').length;
  logger.info(
    { applied: appliedCount, total: results.length },
    appliedCount === 0 ? 'Database schema already up to date' : 'Database migrations complete',
  );
  return results;
}

// `npm run migrate` entry point.
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  try {
    await runMigrations();
    await pool.end();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Migration failed');
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

export default runMigrations;
