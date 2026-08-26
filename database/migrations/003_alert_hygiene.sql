-- 003: alert hygiene (cooldown, expiry, market-hours-only, trailing rules) and
-- notification delivery tracking.

-- ---------------------------------------------------------------------------
-- alert_rules
--   cooldown_minutes  : minimum gap between firings, so a choppy session around
--                       the threshold does not produce a stream of alerts
--   expires_at        : a threshold set for a specific setup should not sit
--                       armed forever
--   market_hours_only : ignore extended-hours prints, which are thin and often
--                       unrepresentative
--   trail_percent     : trailing rule — the threshold follows the extreme price
--                       seen since the rule was armed, which is what a stop
--                       actually is
--   reference_price   : the peak (or trough) a trailing rule measures from
-- ---------------------------------------------------------------------------
ALTER TABLE alert_rules
    ADD COLUMN IF NOT EXISTS cooldown_minutes  INTEGER     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS expires_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS market_hours_only BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS trail_percent     NUMERIC(6, 3),
    ADD COLUMN IF NOT EXISTS reference_price   NUMERIC(18, 4),
    ADD COLUMN IF NOT EXISTS fired_count       BIGINT      NOT NULL DEFAULT 0;

ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS alert_rules_cooldown_check;
ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_cooldown_check
    CHECK (cooldown_minutes >= 0 AND cooldown_minutes <= 10080);

ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS alert_rules_trail_check;
ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_trail_check
    CHECK (trail_percent IS NULL OR (trail_percent > 0 AND trail_percent < 100));

-- An expired rule is skipped by the poller.
CREATE INDEX IF NOT EXISTS alert_rules_expiry_idx ON alert_rules (expires_at)
    WHERE expires_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Delivery: one row per alert per channel, so a send can be retried without
-- risking a duplicate and the user can see whether the alert actually left.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alert_deliveries (
    id           BIGSERIAL PRIMARY KEY,
    alert_id     BIGINT      NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    user_id      BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel      TEXT        NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'pending',
    attempts     INTEGER     NOT NULL DEFAULT 0,
    last_error   TEXT,
    delivered_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT alert_deliveries_alert_channel_key UNIQUE (alert_id, channel),
    CONSTRAINT alert_deliveries_status_check CHECK (status IN ('pending', 'sent', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS alert_deliveries_pending_idx
    ON alert_deliveries (created_at)
    WHERE status = 'pending';

DROP TRIGGER IF EXISTS alert_deliveries_set_updated_at ON alert_deliveries;
CREATE TRIGGER alert_deliveries_set_updated_at
    BEFORE UPDATE ON alert_deliveries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Per-user delivery preferences. Quiet hours are stored in the user's own
-- timezone, because "do not wake me at 3am" is a wall-clock statement.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_settings (
    user_id           BIGINT      PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email_enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    webhook_url       TEXT,
    webhook_enabled   BOOLEAN     NOT NULL DEFAULT FALSE,
    quiet_hours_start SMALLINT,
    quiet_hours_end   SMALLINT,
    timezone          TEXT        NOT NULL DEFAULT 'UTC',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT notification_quiet_start_check
        CHECK (quiet_hours_start IS NULL OR (quiet_hours_start >= 0 AND quiet_hours_start <= 23)),
    CONSTRAINT notification_quiet_end_check
        CHECK (quiet_hours_end IS NULL OR (quiet_hours_end >= 0 AND quiet_hours_end <= 23))
);

DROP TRIGGER IF EXISTS notification_settings_set_updated_at ON notification_settings;
CREATE TRIGGER notification_settings_set_updated_at
    BEFORE UPDATE ON notification_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
