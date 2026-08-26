import { query, queryOne } from '../pool.js';

function toPortfolio(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    cash: row.cash,
    startingCash: row.starting_cash,
    totalCostsPaid: row.total_costs_paid,
    realizedPnl: row.realized_pnl,
    tradeCount: row.trade_count,
    resetCount: row.reset_count,
    openedAt: row.opened_at,
    updatedAt: row.updated_at,
  };
}

function toPosition(row) {
  if (!row) return null;
  return {
    id: row.id,
    stockId: row.stock_id,
    symbol: row.symbol,
    companyName: row.company_name ?? null,
    quantity: row.quantity,
    avgCost: row.avg_cost,
    openedAt: row.opened_at,
  };
}

function toTrade(row) {
  if (!row) return null;
  return {
    id: row.id,
    symbol: row.symbol,
    side: row.side,
    quantity: row.quantity,
    quotePrice: row.quote_price,
    fillPrice: row.fill_price,
    spreadCost: row.spread_cost,
    commission: row.commission,
    cashDelta: row.cash_delta,
    realizedPnl: row.realized_pnl,
    filledWhileClosed: row.filled_while_closed,
    marketSession: row.market_session,
    executedAt: row.executed_at,
  };
}

/** Creates the simulated account on first use. */
export async function ensurePortfolio(userId, startingCash, client) {
  const text = `
    INSERT INTO portfolios (user_id, cash, starting_cash)
    VALUES ($1, $2, $2)
    ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
    RETURNING *`;
  const params = [userId, startingCash];
  const result = client ? await client.query(text, params) : await query(text, params);
  return toPortfolio(result.rows[0]);
}

export async function findPortfolio(userId, client) {
  const text = 'SELECT * FROM portfolios WHERE user_id = $1';
  const result = client ? await client.query(text, [userId]) : await query(text, [userId]);
  return toPortfolio(result.rows[0] ?? null);
}

/** Locks the row for the duration of an order, so two orders cannot both spend the same cash. */
export async function lockPortfolio(userId, client) {
  const { rows } = await client.query('SELECT * FROM portfolios WHERE user_id = $1 FOR UPDATE', [
    userId,
  ]);
  return toPortfolio(rows[0] ?? null);
}

export async function listPositions(userId, client) {
  const text = `
    SELECT p.*, s.company_name
      FROM positions p
      LEFT JOIN stocks s ON s.id = p.stock_id
     WHERE p.user_id = $1
     ORDER BY p.symbol`;
  const result = client ? await client.query(text, [userId]) : await query(text, [userId]);
  return result.rows.map(toPosition);
}

export async function findPosition(userId, stockId, client) {
  const text = 'SELECT * FROM positions WHERE user_id = $1 AND stock_id = $2 FOR UPDATE';
  const result = client
    ? await client.query(text, [userId, stockId])
    : await query(text.replace(' FOR UPDATE', ''), [userId, stockId]);
  return toPosition(result.rows[0] ?? null);
}

/**
 * Adds to a position, recomputing the weighted average cost so the break-even
 * price the user sees includes everything they paid.
 */
export async function upsertPosition({ userId, stockId, symbol, quantity, avgCost }, client) {
  const text = `
    INSERT INTO positions (user_id, stock_id, symbol, quantity, avg_cost)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id, stock_id) DO UPDATE
      SET quantity = $4, avg_cost = $5
    RETURNING *`;
  const params = [userId, stockId, symbol, quantity, avgCost];
  const result = client ? await client.query(text, params) : await query(text, params);
  return toPosition(result.rows[0]);
}

export async function deletePosition(userId, stockId, client) {
  const text = 'DELETE FROM positions WHERE user_id = $1 AND stock_id = $2';
  const params = [userId, stockId];
  if (client) await client.query(text, params);
  else await query(text, params);
}

export async function applyCash({ userId, cashDelta, costs, realizedPnl = 0 }, client) {
  const text = `
    UPDATE portfolios
       SET cash = cash + $2,
           total_costs_paid = total_costs_paid + $3,
           realized_pnl = realized_pnl + $4,
           trade_count = trade_count + 1
     WHERE user_id = $1
     RETURNING *`;
  const params = [userId, cashDelta, costs, realizedPnl];
  const result = client ? await client.query(text, params) : await query(text, params);
  return toPortfolio(result.rows[0]);
}

export async function recordTrade(trade, client) {
  const text = `
    INSERT INTO trades (
      user_id, stock_id, symbol, side, quantity, quote_price, fill_price,
      spread_cost, commission, cash_delta, realized_pnl, filled_while_closed, market_session
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`;
  const params = [
    trade.userId,
    trade.stockId,
    trade.symbol,
    trade.side,
    trade.quantity,
    trade.quotePrice,
    trade.fillPrice,
    trade.spreadCost,
    trade.commission,
    trade.cashDelta,
    trade.realizedPnl ?? null,
    trade.filledWhileClosed ?? false,
    trade.marketSession ?? null,
  ];
  const result = client ? await client.query(text, params) : await query(text, params);
  return toTrade(result.rows[0]);
}

export async function listTrades(userId, { limit = 50, offset = 0, symbol } = {}) {
  const params = [userId];
  let filter = '';
  if (symbol) {
    params.push(symbol.toUpperCase());
    filter = ` AND symbol = $${params.length}`;
  }
  params.push(limit, offset);

  const { rows } = await query(
    `SELECT * FROM trades
      WHERE user_id = $1${filter}
      ORDER BY executed_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows.map(toTrade);
}

export async function countTrades(userId) {
  const row = await queryOne('SELECT COUNT(*)::bigint AS count FROM trades WHERE user_id = $1', [
    userId,
  ]);
  return row?.count ?? 0;
}

export async function firstTradeAt(userId) {
  const row = await queryOne(
    'SELECT MIN(executed_at) AS first FROM trades WHERE user_id = $1',
    [userId],
  );
  return row?.first ?? null;
}

/** Wipes the simulated account. A learning tool has to be restartable. */
export async function resetPortfolio(userId, startingCash, client) {
  const run = client ?? { query: (text, params) => query(text, params) };
  await run.query('DELETE FROM positions WHERE user_id = $1', [userId]);
  await run.query('DELETE FROM trades WHERE user_id = $1', [userId]);
  await run.query('DELETE FROM equity_snapshots WHERE user_id = $1', [userId]);
  const { rows } = await run.query(
    `UPDATE portfolios
        SET cash = $2, starting_cash = $2, total_costs_paid = 0, realized_pnl = 0,
            trade_count = 0, reset_count = reset_count + 1, opened_at = NOW()
      WHERE user_id = $1
      RETURNING *`,
    [userId, startingCash],
  );
  return toPortfolio(rows[0]);
}

export async function saveEquitySnapshot({ userId, date, equity, cash, positionsValue }) {
  await query(
    `INSERT INTO equity_snapshots (user_id, snapshot_date, equity, cash, positions_value)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, snapshot_date) DO UPDATE
       SET equity = EXCLUDED.equity, cash = EXCLUDED.cash,
           positions_value = EXCLUDED.positions_value`,
    [userId, date, equity, cash, positionsValue],
  );
}

export async function listEquitySnapshots(userId, limit = 180) {
  const { rows } = await query(
    `SELECT snapshot_date, equity, cash, positions_value
       FROM equity_snapshots WHERE user_id = $1
      ORDER BY snapshot_date DESC LIMIT $2`,
    [userId, limit],
  );
  return rows
    .map((row) => ({
      date:
        row.snapshot_date instanceof Date
          ? row.snapshot_date.toISOString().slice(0, 10)
          : row.snapshot_date,
      equity: row.equity,
      cash: row.cash,
      positionsValue: row.positions_value,
    }))
    .reverse();
}

/**
 * Records today's equity for every simulated account, in one statement, from the
 * prices the poller just stored. Re-running it the same day overwrites rather
 * than duplicating, so it is safe to call on every cycle.
 */
export async function snapshotAllEquity(date) {
  const { rowCount } = await query(
    `INSERT INTO equity_snapshots (user_id, snapshot_date, equity, cash, positions_value)
     SELECT p.user_id,
            $1::date,
            p.cash + COALESCE(held.value, 0),
            p.cash,
            COALESCE(held.value, 0)
       FROM portfolios p
       LEFT JOIN (
         SELECT pos.user_id, SUM(pos.quantity * COALESCE(lp.price, pos.avg_cost)) AS value
           FROM positions pos
           LEFT JOIN latest_prices lp ON lp.stock_id = pos.stock_id
          GROUP BY pos.user_id
       ) held ON held.user_id = p.user_id
     ON CONFLICT (user_id, snapshot_date) DO UPDATE
       SET equity = EXCLUDED.equity,
           cash = EXCLUDED.cash,
           positions_value = EXCLUDED.positions_value`,
    [date],
  );
  return rowCount;
}

export default {
  ensurePortfolio,
  findPortfolio,
  lockPortfolio,
  listPositions,
  findPosition,
  upsertPosition,
  deletePosition,
  applyCash,
  recordTrade,
  listTrades,
  countTrades,
  firstTradeAt,
  resetPortfolio,
  saveEquitySnapshot,
  listEquitySnapshots,
  snapshotAllEquity,
};
