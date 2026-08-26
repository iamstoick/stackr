import { query, queryOne } from '../pool.js';

function toSettings(row, fallbackUserId) {
  if (!row) {
    // Defaults for a user who has never opened the settings page.
    return {
      userId: fallbackUserId,
      emailEnabled: true,
      webhookUrl: null,
      webhookEnabled: false,
      quietHoursStart: null,
      quietHoursEnd: null,
      timezone: 'UTC',
    };
  }
  return {
    userId: row.user_id,
    emailEnabled: row.email_enabled,
    webhookUrl: row.webhook_url,
    webhookEnabled: row.webhook_enabled,
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    timezone: row.timezone,
    updatedAt: row.updated_at,
  };
}

function toDelivery(row) {
  if (!row) return null;
  return {
    id: row.id,
    alertId: row.alert_id,
    userId: row.user_id,
    channel: row.channel,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
  };
}

export async function getSettings(userId) {
  return toSettings(
    await queryOne('SELECT * FROM notification_settings WHERE user_id = $1', [userId]),
    userId,
  );
}

export async function upsertSettings(userId, patch) {
  const { rows } = await query(
    `INSERT INTO notification_settings (
       user_id, email_enabled, webhook_url, webhook_enabled,
       quiet_hours_start, quiet_hours_end, timezone
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE
       SET email_enabled     = COALESCE(EXCLUDED.email_enabled, notification_settings.email_enabled),
           webhook_url       = EXCLUDED.webhook_url,
           webhook_enabled   = COALESCE(EXCLUDED.webhook_enabled, notification_settings.webhook_enabled),
           quiet_hours_start = EXCLUDED.quiet_hours_start,
           quiet_hours_end   = EXCLUDED.quiet_hours_end,
           timezone          = COALESCE(EXCLUDED.timezone, notification_settings.timezone)
     RETURNING *`,
    [
      userId,
      patch.emailEnabled ?? true,
      patch.webhookUrl ?? null,
      patch.webhookEnabled ?? false,
      patch.quietHoursStart ?? null,
      patch.quietHoursEnd ?? null,
      patch.timezone ?? 'UTC',
    ],
  );
  return toSettings(rows[0], userId);
}

/**
 * Queues one delivery. The unique (alert_id, channel) constraint means a retry
 * or a double-enqueue can never send the same alert twice on the same channel.
 */
export async function enqueue({ alertId, userId, channel, status = 'pending' }, client) {
  const text = `
    INSERT INTO alert_deliveries (alert_id, user_id, channel, status)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (alert_id, channel) DO NOTHING
    RETURNING *`;
  const params = [alertId, userId, channel, status];
  const result = client ? await client.query(text, params) : await query(text, params);
  return toDelivery(result.rows[0] ?? null);
}

/**
 * Claims a batch of pending deliveries for this worker.
 *
 * SKIP LOCKED means two API containers running the dispatcher will each take
 * different rows rather than both sending the same alert.
 */
export async function claimPending(limit, maxAttempts) {
  // Claim first, then read the joined detail: UPDATE ... FROM cannot express the
  // outer join to settings, and splitting keeps the lock window short.
  const { rows: claimed } = await query(
    `WITH candidates AS (
       SELECT id FROM alert_deliveries
        WHERE status = 'pending' AND attempts < $2
        ORDER BY created_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE alert_deliveries d
        SET attempts = d.attempts + 1
       FROM candidates
      WHERE d.id = candidates.id
      RETURNING d.id`,
    [limit, maxAttempts],
  );

  if (claimed.length === 0) return [];

  const { rows } = await query(
    `SELECT d.*,
            a.symbol, a.message, a.kind, a.type, a.condition,
            a.trigger_price, a.threshold, a.triggered_at,
            u.email, u.name,
            ns.webhook_url, ns.email_enabled, ns.webhook_enabled, ns.timezone,
            ns.quiet_hours_start, ns.quiet_hours_end
       FROM alert_deliveries d
       JOIN alerts a ON a.id = d.alert_id
       JOIN users u ON u.id = d.user_id
       LEFT JOIN notification_settings ns ON ns.user_id = d.user_id
      WHERE d.id = ANY($1)
      ORDER BY d.created_at`,
    [claimed.map((row) => row.id)],
  );

  return rows.map((row) => ({
    ...toDelivery(row),
    alert: {
      id: row.alert_id,
      symbol: row.symbol,
      message: row.message,
      kind: row.kind,
      type: row.type,
      condition: row.condition,
      triggerPrice: row.trigger_price,
      threshold: row.threshold,
      triggeredAt: row.triggered_at,
    },
    recipient: { email: row.email, name: row.name },
    settings: {
      webhookUrl: row.webhook_url,
      emailEnabled: row.email_enabled ?? true,
      webhookEnabled: row.webhook_enabled ?? false,
      timezone: row.timezone ?? 'UTC',
      quietHoursStart: row.quiet_hours_start,
      quietHoursEnd: row.quiet_hours_end,
    },
  }));
}

export async function markSent(id) {
  await query(
    `UPDATE alert_deliveries SET status = 'sent', delivered_at = NOW(), last_error = NULL WHERE id = $1`,
    [id],
  );
}

export async function markSkipped(id, reason) {
  await query(`UPDATE alert_deliveries SET status = 'skipped', last_error = $2 WHERE id = $1`, [
    id,
    reason,
  ]);
}

/** Keeps the row pending until attempts run out, then gives up permanently. */
export async function markFailed(id, error, maxAttempts) {
  await query(
    `UPDATE alert_deliveries
        SET status = CASE WHEN attempts >= $3 THEN 'failed' ELSE 'pending' END,
            last_error = $2
      WHERE id = $1`,
    [id, String(error).slice(0, 500), maxAttempts],
  );
}

export async function statsForUser(userId) {
  const { rows } = await query(
    `SELECT channel, status, COUNT(*)::bigint AS count
       FROM alert_deliveries WHERE user_id = $1
      GROUP BY channel, status`,
    [userId],
  );
  return rows.map((row) => ({ channel: row.channel, status: row.status, count: row.count }));
}

export async function queueDepth() {
  const row = await queryOne(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'pending')::bigint AS pending,
       COUNT(*) FILTER (WHERE status = 'failed')::bigint  AS failed,
       COUNT(*) FILTER (WHERE status = 'sent')::bigint    AS sent
     FROM alert_deliveries`,
  );
  return { pending: row?.pending ?? 0, failed: row?.failed ?? 0, sent: row?.sent ?? 0 };
}

export default {
  getSettings,
  upsertSettings,
  enqueue,
  claimPending,
  markSent,
  markSkipped,
  markFailed,
  statsForUser,
  queueDepth,
};
