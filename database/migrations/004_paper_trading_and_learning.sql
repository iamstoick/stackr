-- 004: simulated portfolios (paper trading) and learning progress.

-- ---------------------------------------------------------------------------
-- portfolios: one simulated account per user. Cash is the only balance that
-- matters; position value is derived from live quotes, never stored.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolios (
    user_id          BIGINT      PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    cash             NUMERIC(18, 4) NOT NULL,
    starting_cash    NUMERIC(18, 4) NOT NULL,
    total_costs_paid NUMERIC(18, 4) NOT NULL DEFAULT 0,
    realized_pnl     NUMERIC(18, 4) NOT NULL DEFAULT 0,
    trade_count      BIGINT      NOT NULL DEFAULT 0,
    reset_count      INTEGER     NOT NULL DEFAULT 0,
    opened_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT portfolios_cash_check CHECK (cash >= 0)
);

DROP TRIGGER IF EXISTS portfolios_set_updated_at ON portfolios;
CREATE TRIGGER portfolios_set_updated_at
    BEFORE UPDATE ON portfolios
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- positions: what the user currently holds.
-- avg_cost is the weighted average price paid *including* costs, so the
-- break-even price a beginner sees is the real one.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS positions (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stock_id     BIGINT      NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    symbol       TEXT        NOT NULL,
    quantity     NUMERIC(18, 6) NOT NULL,
    avg_cost     NUMERIC(18, 4) NOT NULL,
    opened_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT positions_user_stock_key UNIQUE (user_id, stock_id),
    CONSTRAINT positions_quantity_check CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS positions_user_id_idx ON positions (user_id);

DROP TRIGGER IF EXISTS positions_set_updated_at ON positions;
CREATE TRIGGER positions_set_updated_at
    BEFORE UPDATE ON positions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- trades: the immutable ledger. Every cost is stored separately so the app can
-- show a beginner exactly what the trade cost them beyond the share price.
-- `filled_while_closed` marks a fill that a real broker would have queued to
-- the next open, which is a lesson in itself.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trades (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stock_id            BIGINT      REFERENCES stocks(id) ON DELETE SET NULL,
    symbol              TEXT        NOT NULL,
    side                TEXT        NOT NULL CHECK (side IN ('BUY', 'SELL')),
    quantity            NUMERIC(18, 6) NOT NULL CHECK (quantity > 0),
    quote_price         NUMERIC(18, 4) NOT NULL,
    fill_price          NUMERIC(18, 4) NOT NULL,
    spread_cost         NUMERIC(18, 4) NOT NULL DEFAULT 0,
    commission          NUMERIC(18, 4) NOT NULL DEFAULT 0,
    cash_delta          NUMERIC(18, 4) NOT NULL,
    realized_pnl        NUMERIC(18, 4),
    filled_while_closed BOOLEAN     NOT NULL DEFAULT FALSE,
    market_session      TEXT,
    executed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trades_user_executed_at_idx ON trades (user_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS trades_user_symbol_idx ON trades (user_id, symbol);

-- ---------------------------------------------------------------------------
-- equity_snapshots: one row per user per day, so the learner can see their own
-- equity curve and compare it against buy-and-hold. Written by the poller.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS equity_snapshots (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    snapshot_date DATE        NOT NULL,
    equity        NUMERIC(18, 4) NOT NULL,
    cash          NUMERIC(18, 4) NOT NULL,
    positions_value NUMERIC(18, 4) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT equity_snapshots_user_date_key UNIQUE (user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS equity_snapshots_user_date_idx
    ON equity_snapshots (user_id, snapshot_date DESC);

-- ---------------------------------------------------------------------------
-- learning_progress: which lessons have been read and which onboarding steps
-- were dismissed. Step completion itself is derived from real activity, so only
-- the things that cannot be derived are stored.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learning_progress (
    user_id       BIGINT      PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    lessons_read  TEXT[]      NOT NULL DEFAULT '{}',
    tour_dismissed BOOLEAN    NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS learning_progress_set_updated_at ON learning_progress;
CREATE TRIGGER learning_progress_set_updated_at
    BEFORE UPDATE ON learning_progress
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
