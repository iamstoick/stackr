import { query, queryOne } from '../pool.js';

function toAlert(row) {
  if (!row) return null;
  return {
    id: row.id,
    alertRuleId: row.alert_rule_id,
    userId: row.user_id,
    stockId: row.stock_id,
    symbol: row.symbol,
    companyName: row.company_name ?? null,
    kind: row.kind ?? 'THRESHOLD',
    type: row.type,
    condition: row.condition,
    triggerPrice: row.trigger_price,
    triggerKind: row.trigger_kind ?? null,
    threshold: row.threshold,
    message: row.message,
    triggeredAt: row.triggered_at,
    acknowledgedAt: row.acknowledged_at,
  };
}

const SELECT_ALERTS = `
  SELECT a.*, s.company_name
    FROM alerts a
    LEFT JOIN stocks s ON s.id = a.stock_id`;

export async function listByUser(userId, { limit = 50, offset = 0, unacknowledgedOnly = false } = {}) {
  const conditions = ['a.user_id = $1'];
  const params = [userId];
  if (unacknowledgedOnly) conditions.push('a.acknowledged_at IS NULL');
  params.push(limit, offset);

  const { rows } = await query(
    `${SELECT_ALERTS}
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.triggered_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows.map(toAlert);
}

export async function countByUser(userId, { unacknowledgedOnly = false } = {}) {
  const row = await queryOne(
    `SELECT COUNT(*)::bigint AS count FROM alerts
      WHERE user_id = $1 ${unacknowledgedOnly ? 'AND acknowledged_at IS NULL' : ''}`,
    [userId],
  );
  return row?.count ?? 0;
}

export async function create(alert, client) {
  const text = `
    INSERT INTO alerts (
      alert_rule_id, user_id, stock_id, symbol, kind, type, condition,
      trigger_price, trigger_kind, threshold, message
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`;
  const params = [
    alert.alertRuleId ?? null,
    alert.userId,
    alert.stockId ?? null,
    alert.symbol,
    alert.kind ?? 'THRESHOLD',
    alert.type,
    alert.condition ?? null,
    alert.triggerPrice ?? null,
    alert.triggerKind ?? null,
    alert.threshold ?? null,
    alert.message,
  ];
  const result = client ? await client.query(text, params) : await query(text, params);
  return toAlert(result.rows[0]);
}

export async function acknowledge(id, userId) {
  const { rows } = await query(
    `UPDATE alerts
        SET acknowledged_at = COALESCE(acknowledged_at, NOW())
      WHERE id = $1 AND user_id = $2
      RETURNING *`,
    [id, userId],
  );
  return toAlert(rows[0] ?? null);
}

export default { listByUser, countByUser, create, acknowledge };
