import { query, queryOne } from '../pool.js';

export function toStock(row) {
  if (!row) return null;
  return {
    id: row.id,
    symbol: row.symbol,
    companyName: row.company_name,
    exchange: row.exchange,
    currency: row.currency,
    country: row.country,
    logoUrl: row.logo_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findBySymbol(symbol, client) {
  const run = client ? (t, p) => client.query(t, p).then((r) => r.rows[0] ?? null) : queryOne;
  return toStock(await run('SELECT * FROM stocks WHERE symbol = $1', [symbol.toUpperCase()]));
}

export async function findById(id) {
  return toStock(await queryOne('SELECT * FROM stocks WHERE id = $1', [id]));
}

/**
 * Inserts or refreshes the cached metadata for a symbol. COALESCE keeps
 * previously known values when the provider returns a sparse profile.
 */
export async function upsert({ symbol, companyName, exchange, currency, country, logoUrl }, client) {
  const text = `
    INSERT INTO stocks (symbol, company_name, exchange, currency, country, logo_url)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (symbol) DO UPDATE
      SET company_name = COALESCE(EXCLUDED.company_name, stocks.company_name),
          exchange     = COALESCE(EXCLUDED.exchange, stocks.exchange),
          currency     = COALESCE(EXCLUDED.currency, stocks.currency),
          country      = COALESCE(EXCLUDED.country, stocks.country),
          logo_url     = COALESCE(EXCLUDED.logo_url, stocks.logo_url)
    RETURNING *`;
  const params = [
    symbol.toUpperCase(),
    companyName ?? null,
    exchange ?? null,
    currency ?? null,
    country ?? null,
    logoUrl ?? null,
  ];
  const result = client ? await client.query(text, params) : await query(text, params);
  return toStock(result.rows[0]);
}

/**
 * Symbols the poller must refresh: anything favorited, under an enabled rule, or
 * held in a simulated portfolio. One row per symbol however many users want it.
 */
export async function findActiveSymbols() {
  const { rows } = await query(
    `SELECT DISTINCT s.id, s.symbol
       FROM stocks s
      WHERE EXISTS (SELECT 1 FROM favorites f WHERE f.stock_id = s.id)
         OR EXISTS (SELECT 1 FROM alert_rules r WHERE r.stock_id = s.id AND r.enabled)
         OR EXISTS (SELECT 1 FROM positions p WHERE p.stock_id = s.id)
      ORDER BY s.symbol`,
  );
  return rows.map((row) => ({ id: row.id, symbol: row.symbol }));
}

export default { findBySymbol, findById, upsert, findActiveSymbols, toStock };
