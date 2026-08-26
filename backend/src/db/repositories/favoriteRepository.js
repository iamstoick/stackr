import { query, queryOne } from '../pool.js';

function toFavorite(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    stock: {
      id: row.stock_id,
      symbol: row.symbol,
      companyName: row.company_name,
      exchange: row.exchange,
      currency: row.currency,
      logoUrl: row.logo_url,
    },
    quote:
      row.price === null || row.price === undefined
        ? null
        : {
            price: row.price,
            change: row.change,
            changePercent: row.change_percent,
            high: row.high,
            low: row.low,
            open: row.open,
            previousClose: row.previous_close,
            // Where in the day's range the last trade sits: 0 means it closed on
            // the low, 1 on the high. Traders read this before the percentage.
            rangePosition:
              row.high !== null && row.low !== null && row.high > row.low
                ? Number(((row.price - row.low) / (row.high - row.low)).toFixed(4))
                : null,
            timestamp: row.timestamp,
            updatedAt: row.price_updated_at,
          },
    alertCount: Number(row.alert_count ?? 0),
    triggeredAlertCount: Number(row.triggered_alert_count ?? 0),
  };
}

/** The watchlist: favorites joined with the most recent polled quote. */
export async function listByUser(userId) {
  const { rows } = await query(
    `SELECT f.id, f.created_at,
            s.id AS stock_id, s.symbol, s.company_name, s.exchange, s.currency, s.logo_url,
            lp.price, lp.change, lp.change_percent, lp.high, lp.low, lp.open,
            lp.previous_close, lp.timestamp,
            lp.updated_at AS price_updated_at,
            COALESCE(r.alert_count, 0) AS alert_count,
            COALESCE(r.triggered_alert_count, 0) AS triggered_alert_count
       FROM favorites f
       JOIN stocks s ON s.id = f.stock_id
       LEFT JOIN latest_prices lp ON lp.stock_id = s.id
       -- Which watched names carry armed thresholds, so the dashboard can show
       -- it without a second round trip per row.
       LEFT JOIN (
         SELECT stock_id,
                COUNT(*) FILTER (WHERE enabled AND suspended_at IS NULL) AS alert_count,
                COUNT(*) FILTER (WHERE triggered) AS triggered_alert_count
           FROM alert_rules
          WHERE user_id = $1
          GROUP BY stock_id
       ) r ON r.stock_id = s.id
      WHERE f.user_id = $1
      ORDER BY s.symbol`,
    [userId],
  );
  return rows.map(toFavorite);
}

export async function exists(userId, stockId) {
  const row = await queryOne(
    'SELECT 1 FROM favorites WHERE user_id = $1 AND stock_id = $2',
    [userId, stockId],
  );
  return row !== null;
}

export async function symbolsForUser(userId) {
  const { rows } = await query(
    `SELECT s.symbol FROM favorites f JOIN stocks s ON s.id = f.stock_id WHERE f.user_id = $1`,
    [userId],
  );
  return rows.map((r) => r.symbol);
}

/** Idempotent: adding an existing favorite is a no-op that still succeeds. */
export async function add(userId, stockId) {
  const { rows } = await query(
    `INSERT INTO favorites (user_id, stock_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, stock_id) DO NOTHING
     RETURNING id`,
    [userId, stockId],
  );
  return { created: rows.length > 0 };
}

/** Removing a nonexistent favorite is not an error. */
export async function remove(userId, stockId) {
  const { rowCount } = await query(
    'DELETE FROM favorites WHERE user_id = $1 AND stock_id = $2',
    [userId, stockId],
  );
  return { removed: rowCount > 0 };
}

export default { listByUser, exists, symbolsForUser, add, remove };
