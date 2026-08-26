import { query, queryOne } from '../pool.js';

export function toRule(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    stockId: row.stock_id,
    symbol: row.symbol,
    companyName: row.company_name,
    type: row.type,
    condition: row.condition,
    threshold: row.threshold,
    enabled: row.enabled,
    triggered: row.triggered,
    suspendedAt: row.suspended_at ?? null,
    suspendedReason: row.suspended_reason ?? null,
    cooldownMinutes: row.cooldown_minutes ?? 0,
    expiresAt: row.expires_at ?? null,
    marketHoursOnly: row.market_hours_only ?? false,
    trailPercent: row.trail_percent ?? null,
    referencePrice: row.reference_price ?? null,
    firedCount: row.fired_count ?? 0,
    lastTriggeredAt: row.last_triggered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_WITH_STOCK = `
  SELECT r.*, s.symbol, s.company_name
    FROM alert_rules r
    JOIN stocks s ON s.id = r.stock_id`;

export async function listByUser(userId) {
  const { rows } = await query(
    `${SELECT_WITH_STOCK} WHERE r.user_id = $1 ORDER BY r.created_at DESC`,
    [userId],
  );
  return rows.map(toRule);
}

export async function listByUserAndSymbol(userId, symbol) {
  const { rows } = await query(
    `${SELECT_WITH_STOCK} WHERE r.user_id = $1 AND s.symbol = $2 ORDER BY r.created_at DESC`,
    [userId, symbol.toUpperCase()],
  );
  return rows.map(toRule);
}

export async function findByIdForUser(id, userId) {
  return toRule(await queryOne(`${SELECT_WITH_STOCK} WHERE r.id = $1 AND r.user_id = $2`, [id, userId]));
}

export async function findDuplicate({ userId, stockId, type, condition, threshold }) {
  return toRule(
    await queryOne(
      `${SELECT_WITH_STOCK}
        WHERE r.user_id = $1 AND r.stock_id = $2 AND r.type = $3
          AND r.condition = $4 AND r.threshold = $5`,
      [userId, stockId, type, condition, threshold],
    ),
  );
}

export async function create({
  userId,
  stockId,
  type,
  condition,
  threshold,
  enabled = true,
  cooldownMinutes = 0,
  expiresAt = null,
  marketHoursOnly = false,
  trailPercent = null,
  referencePrice = null,
}) {
  const { rows } = await query(
    `WITH inserted AS (
       INSERT INTO alert_rules (
         user_id, stock_id, type, condition, threshold, enabled,
         cooldown_minutes, expires_at, market_hours_only, trail_percent, reference_price
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *
     )
     SELECT inserted.*, s.symbol, s.company_name
       FROM inserted JOIN stocks s ON s.id = inserted.stock_id`,
    [
      userId,
      stockId,
      type,
      condition,
      threshold,
      enabled,
      cooldownMinutes,
      expiresAt,
      marketHoursOnly,
      trailPercent,
      referencePrice,
    ],
  );
  return toRule(rows[0]);
}

/**
 * Patches only the supplied fields. Changing the threshold, condition or
 * re-enabling a rule clears the latch so the new configuration can fire.
 */
export async function update(id, userId, patch) {
  const sets = [];
  const params = [];
  const push = (column, value) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };

  if (patch.type !== undefined) push('type', patch.type);
  if (patch.condition !== undefined) push('condition', patch.condition);
  if (patch.threshold !== undefined) push('threshold', patch.threshold);
  if (patch.enabled !== undefined) push('enabled', patch.enabled);
  if (patch.cooldownMinutes !== undefined) push('cooldown_minutes', patch.cooldownMinutes);
  if (patch.expiresAt !== undefined) push('expires_at', patch.expiresAt);
  if (patch.marketHoursOnly !== undefined) push('market_hours_only', patch.marketHoursOnly);
  if (patch.trailPercent !== undefined) {
    push('trail_percent', patch.trailPercent);
    // A changed trail distance must re-measure from the current price rather
    // than keeping a reference set under the old distance.
    sets.push('reference_price = NULL');
  }

  const resetsLatch =
    patch.threshold !== undefined || patch.condition !== undefined || patch.enabled === true;
  if (resetsLatch) {
    // Any deliberate change is the owner confirming what the rule means, which
    // both re-arms it and lifts a corporate-action suspension.
    sets.push('triggered = FALSE');
    sets.push('suspended_at = NULL');
    sets.push('suspended_reason = NULL');
  }

  if (sets.length === 0) return findByIdForUser(id, userId);

  params.push(id, userId);
  const { rows } = await query(
    `WITH updated AS (
       UPDATE alert_rules SET ${sets.join(', ')}
        WHERE id = $${params.length - 1} AND user_id = $${params.length}
        RETURNING *
     )
     SELECT updated.*, s.symbol, s.company_name
       FROM updated JOIN stocks s ON s.id = updated.stock_id`,
    params,
  );
  return toRule(rows[0] ?? null);
}

export async function remove(id, userId) {
  const { rowCount } = await query('DELETE FROM alert_rules WHERE id = $1 AND user_id = $2', [
    id,
    userId,
  ]);
  return { removed: rowCount > 0 };
}

/**
 * Enabled, unsuspended rules for one instrument, across all users — the
 * poller's input.
 */
export async function findEnabledByStockId(stockId, client) {
  const text = `${SELECT_WITH_STOCK}
    WHERE r.stock_id = $1 AND r.enabled = TRUE AND r.suspended_at IS NULL
    FOR UPDATE OF r`;
  const result = client ? await client.query(text, [stockId]) : await query(text, [stockId]);
  return result.rows.map(toRule);
}

/**
 * Pauses every active rule on one instrument and returns them, so their owners
 * can be told why. Used when a corporate action invalidates the thresholds.
 */
export async function suspendByStockId(stockId, reason, client) {
  const text = `
    WITH suspended AS (
      UPDATE alert_rules
         SET suspended_at = NOW(), suspended_reason = $2, triggered = FALSE
       WHERE stock_id = $1 AND suspended_at IS NULL
       RETURNING *
    )
    SELECT suspended.*, s.symbol, s.company_name
      FROM suspended JOIN stocks s ON s.id = suspended.stock_id`;
  const params = [stockId, reason];
  const result = client ? await client.query(text, params) : await query(text, params);
  return result.rows.map(toRule);
}

export async function setLatchState(
  id,
  { triggered, lastTriggeredAt, incrementFired = false },
  client,
) {
  const text = `
    UPDATE alert_rules
       SET triggered = $2,
           last_triggered_at = COALESCE($3, last_triggered_at),
           fired_count = fired_count + $4
     WHERE id = $1`;
  const params = [id, triggered, lastTriggeredAt ?? null, incrementFired ? 1 : 0];
  if (client) await client.query(text, params);
  else await query(text, params);
}

/** Advances a trailing rule's high-water (or low-water) mark. */
export async function setReferencePrice(id, referencePrice, client) {
  const text = 'UPDATE alert_rules SET reference_price = $2 WHERE id = $1';
  const params = [id, referencePrice];
  if (client) await client.query(text, params);
  else await query(text, params);
}

export default {
  listByUser,
  listByUserAndSymbol,
  findByIdForUser,
  findDuplicate,
  create,
  update,
  remove,
  findEnabledByStockId,
  suspendByStockId,
  setLatchState,
  setReferencePrice,
  toRule,
};
