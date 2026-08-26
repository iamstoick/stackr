-- 001_init: users, stocks, favorites, alert_rules, alerts, latest_prices.

-- Reusable trigger function keeping updated_at honest without app-side effort.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id          BIGSERIAL PRIMARY KEY,
    google_id   TEXT        NOT NULL UNIQUE,
    email       TEXT        NOT NULL UNIQUE,
    name        TEXT,
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- stocks: locally cached instrument metadata from Finnhub.
-- exchange/currency/country stay nullable because the provider's coverage of
-- profile data is uneven, especially for non-US listings.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stocks (
    id            BIGSERIAL PRIMARY KEY,
    symbol        TEXT        NOT NULL,
    company_name  TEXT,
    exchange      TEXT,
    currency      TEXT,
    country       TEXT,
    logo_url      TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT stocks_symbol_key UNIQUE (symbol)
);

DROP TRIGGER IF EXISTS stocks_set_updated_at ON stocks;
CREATE TRIGGER stocks_set_updated_at
    BEFORE UPDATE ON stocks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- favorites (watchlist)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS favorites (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stock_id   BIGINT      NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT favorites_user_stock_key UNIQUE (user_id, stock_id)
);

CREATE INDEX IF NOT EXISTS favorites_user_id_idx ON favorites (user_id);
CREATE INDEX IF NOT EXISTS favorites_stock_id_idx ON favorites (stock_id);

-- ---------------------------------------------------------------------------
-- alert_rules: user-configured thresholds.
-- `triggered` is the latch that stops re-firing while price stays beyond the
-- threshold; it resets when the condition stops being met.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alert_rules (
    id                BIGSERIAL PRIMARY KEY,
    user_id           BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stock_id          BIGINT       NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    type              TEXT         NOT NULL CHECK (type IN ('BUY', 'SELL')),
    condition         TEXT         NOT NULL CHECK (condition IN ('ABOVE', 'BELOW')),
    threshold         NUMERIC(18, 4) NOT NULL CHECK (threshold > 0),
    enabled           BOOLEAN      NOT NULL DEFAULT TRUE,
    triggered         BOOLEAN      NOT NULL DEFAULT FALSE,
    last_triggered_at TIMESTAMPTZ,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS alert_rules_user_id_idx ON alert_rules (user_id);
CREATE INDEX IF NOT EXISTS alert_rules_stock_id_idx ON alert_rules (stock_id);
-- The poller only ever scans enabled rules.
CREATE INDEX IF NOT EXISTS alert_rules_enabled_idx ON alert_rules (stock_id) WHERE enabled;

DROP TRIGGER IF EXISTS alert_rules_set_updated_at ON alert_rules;
CREATE TRIGGER alert_rules_set_updated_at
    BEFORE UPDATE ON alert_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- alerts: immutable log of triggered alerts.
-- symbol/type/threshold are denormalized on purpose so history stays readable
-- after a rule is edited or deleted.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alerts (
    id              BIGSERIAL PRIMARY KEY,
    alert_rule_id   BIGINT       REFERENCES alert_rules(id) ON DELETE SET NULL,
    user_id         BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stock_id        BIGINT       REFERENCES stocks(id) ON DELETE SET NULL,
    symbol          TEXT         NOT NULL,
    type            TEXT         NOT NULL,
    condition       TEXT         NOT NULL,
    trigger_price   NUMERIC(18, 4) NOT NULL,
    threshold       NUMERIC(18, 4) NOT NULL,
    message         TEXT         NOT NULL,
    triggered_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS alerts_user_triggered_at_idx ON alerts (user_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS alerts_rule_id_idx ON alerts (alert_rule_id);
CREATE INDEX IF NOT EXISTS alerts_unacknowledged_idx ON alerts (user_id) WHERE acknowledged_at IS NULL;

-- ---------------------------------------------------------------------------
-- latest_prices: newest quote per instrument, written by the poller.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS latest_prices (
    stock_id       BIGINT       PRIMARY KEY REFERENCES stocks(id) ON DELETE CASCADE,
    symbol         TEXT         NOT NULL,
    price          NUMERIC(18, 4),
    change         NUMERIC(18, 4),
    change_percent NUMERIC(12, 4),
    high           NUMERIC(18, 4),
    low            NUMERIC(18, 4),
    open           NUMERIC(18, 4),
    previous_close NUMERIC(18, 4),
    timestamp      TIMESTAMPTZ,
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS latest_prices_symbol_idx ON latest_prices (symbol);
