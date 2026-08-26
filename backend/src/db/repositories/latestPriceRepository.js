import { query, queryOne } from '../pool.js';

function toLatestPrice(row) {
  if (!row) return null;
  return {
    stockId: row.stock_id,
    symbol: row.symbol,
    price: row.price,
    change: row.change,
    changePercent: row.change_percent,
    high: row.high,
    low: row.low,
    open: row.open,
    previousClose: row.previous_close,
    intervalHigh: row.interval_high,
    intervalLow: row.interval_low,
    // DATE comes back as a JS Date; the exchange-local day is what matters.
    sessionDate:
      row.session_date instanceof Date
        ? row.session_date.toISOString().slice(0, 10)
        : (row.session_date ?? null),
    observations: row.observations ?? 0,
    timestamp: row.timestamp,
    updatedAt: row.updated_at,
  };
}

export async function findBySymbol(symbol) {
  return toLatestPrice(
    await queryOne('SELECT * FROM latest_prices WHERE symbol = $1', [symbol.toUpperCase()]),
  );
}

export async function findByStockId(stockId, client) {
  const text = 'SELECT * FROM latest_prices WHERE stock_id = $1';
  const result = client ? await client.query(text, [stockId]) : await query(text, [stockId]);
  return toLatestPrice(result.rows[0] ?? null);
}

/** Writes the newest quote for an instrument (one row per stock). */
export async function upsert(quote, client) {
  const text = `
    INSERT INTO latest_prices (
      stock_id, symbol, price, change, change_percent,
      high, low, open, previous_close,
      interval_high, interval_low, session_date, observations,
      timestamp, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
    ON CONFLICT (stock_id) DO UPDATE
      SET symbol         = EXCLUDED.symbol,
          price          = EXCLUDED.price,
          change         = EXCLUDED.change,
          change_percent = EXCLUDED.change_percent,
          high           = EXCLUDED.high,
          low            = EXCLUDED.low,
          open           = EXCLUDED.open,
          previous_close = EXCLUDED.previous_close,
          interval_high  = EXCLUDED.interval_high,
          interval_low   = EXCLUDED.interval_low,
          session_date   = EXCLUDED.session_date,
          observations   = EXCLUDED.observations,
          timestamp      = EXCLUDED.timestamp,
          updated_at     = NOW()
    RETURNING *`;
  const params = [
    quote.stockId,
    quote.symbol,
    quote.price ?? null,
    quote.change ?? null,
    quote.changePercent ?? null,
    quote.high ?? null,
    quote.low ?? null,
    quote.open ?? null,
    quote.previousClose ?? null,
    quote.intervalHigh ?? null,
    quote.intervalLow ?? null,
    quote.sessionDate ?? null,
    quote.observations ?? 0,
    quote.timestamp ?? null,
  ];
  const result = client ? await client.query(text, params) : await query(text, params);
  return toLatestPrice(result.rows[0]);
}

/** Clears interval extremes after a corporate action makes them meaningless. */
export async function clearIntervalExtremes(stockId, client) {
  const text = `
    UPDATE latest_prices
       SET interval_high = NULL, interval_low = NULL, observations = 0
     WHERE stock_id = $1`;
  if (client) await client.query(text, [stockId]);
  else await query(text, [stockId]);
}

export default { findBySymbol, findByStockId, upsert, clearIntervalExtremes };
