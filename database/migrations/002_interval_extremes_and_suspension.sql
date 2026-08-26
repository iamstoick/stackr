-- 002: evaluate alerts against interval extremes, and suspend rules whose
-- reference price was re-based by a corporate action.

-- ---------------------------------------------------------------------------
-- latest_prices: remember the extremes seen since the previous observation, so
-- a threshold crossed and reversed between two polls is still detected.
-- `session_date` is the exchange-local trading date, used to reset the extremes
-- when a new session starts.
-- ---------------------------------------------------------------------------
ALTER TABLE latest_prices
    ADD COLUMN IF NOT EXISTS interval_high NUMERIC(18, 4),
    ADD COLUMN IF NOT EXISTS interval_low  NUMERIC(18, 4),
    ADD COLUMN IF NOT EXISTS session_date  DATE,
    ADD COLUMN IF NOT EXISTS observations  BIGINT NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- alert_rules: a suspended rule keeps its configuration but is skipped by the
-- poller until the owner confirms the threshold still means what they intended.
-- ---------------------------------------------------------------------------
ALTER TABLE alert_rules
    ADD COLUMN IF NOT EXISTS suspended_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

-- The poller scans enabled, unsuspended rules.
CREATE INDEX IF NOT EXISTS alert_rules_pollable_idx
    ON alert_rules (stock_id)
    WHERE enabled AND suspended_at IS NULL;

-- ---------------------------------------------------------------------------
-- alerts: alongside threshold alerts, the table now carries system notices
-- (such as a suspected split), which have no condition or threshold of their
-- own. `trigger_kind` records whether the alert fired on the last trade or on
-- an extreme observed between polls.
-- ---------------------------------------------------------------------------
ALTER TABLE alerts
    ADD COLUMN IF NOT EXISTS kind         TEXT NOT NULL DEFAULT 'THRESHOLD',
    ADD COLUMN IF NOT EXISTS trigger_kind TEXT;

ALTER TABLE alerts ALTER COLUMN condition     DROP NOT NULL;
ALTER TABLE alerts ALTER COLUMN trigger_price DROP NOT NULL;
ALTER TABLE alerts ALTER COLUMN threshold     DROP NOT NULL;

ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_kind_check;
ALTER TABLE alerts ADD CONSTRAINT alerts_kind_check
    CHECK (kind IN ('THRESHOLD', 'SYSTEM'));

CREATE INDEX IF NOT EXISTS alerts_user_kind_idx ON alerts (user_id, kind, triggered_at DESC);
