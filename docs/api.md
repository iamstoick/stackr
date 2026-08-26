# Stackr API reference

Base URL: `/api` (through Nginx: `http://localhost:8080/api`).

All request and response bodies are JSON. Timestamps are UTC ISO-8601 strings. Prices are numbers,
not strings.

## Authentication

Protected endpoints accept either:

- the `sm_token` HTTP-only cookie set by the OAuth callback (what browsers use), or
- an `Authorization: Bearer <jwt>` header (for API clients and tests).

Missing or invalid credentials return `401 UNAUTHENTICATED`.

## Errors

Every error uses one envelope:

```json
{
  "error": {
    "code": "ALERT_RULE_NOT_FOUND",
    "message": "That alert rule does not exist."
  }
}
```

Validation failures add `details`:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [{ "field": "body.threshold", "message": "Too small: expected number to be >0" }]
  }
}
```

| Status | Codes |
| --- | --- |
| 400 | `BAD_REQUEST` |
| 401 | `UNAUTHENTICATED` |
| 403 | `FORBIDDEN` |
| 404 | `ROUTE_NOT_FOUND`, `STOCK_NOT_FOUND`, `ALERT_RULE_NOT_FOUND`, `ALERT_NOT_FOUND` |
| 409 | `ALERT_RULE_EXISTS`, `ALERT_LIMIT_REACHED`, `FAVORITE_LIMIT_REACHED`, `CONFLICT` |
| 422 | `VALIDATION_ERROR` |
| 429 | `RATE_LIMITED` (ours or the provider's) |
| 500 | `INTERNAL_ERROR` |
| 502 | `PROVIDER_ERROR`, `PROVIDER_ACCESS_DENIED` |
| 503 | `SERVICE_UNAVAILABLE`, `DATABASE_UNAVAILABLE`, `PROVIDER_NOT_CONFIGURED`, `OAUTH_NOT_CONFIGURED` |
| 504 | `PROVIDER_TIMEOUT` |

## Rate limits

Per authenticated user, or per IP when anonymous. `RateLimit` headers (draft-8) are returned.

| Scope | Window | Limit |
| --- | --- | --- |
| All `/api` | 1 min | 300 |
| `/api/auth/google*` | 15 min | 30 |
| `/api/stocks/search` | 1 min | 60 |
| Writes (favorites, alerts) | 1 min | 60 |

---

## Health

### `GET /health`

Liveness. No dependencies, no auth. Always `200` while the process serves traffic.

```json
{ "status": "ok", "service": "stackr-backend", "env": "production", "uptimeSeconds": 412 }
```

### `GET /health/ready`

Readiness: `200` when the database answers and required configuration is present, `503` otherwise.

```json
{
  "status": "ready",
  "checks": { "database": "ok", "configuration": "ok" },
  "configIssues": [],
  "features": {
    "googleOAuth": true,
    "finnhub": true,
    "twelveData": true,
    "emailNotifications": false,
    "webhookNotifications": true
  },
  "providers": { "quotes": "finnhub", "candles": "twelvedata" },
  "poller": {
    "enabled": true,
    "cron": "*/5 * * * *",
    "skipWhenClosed": true,
    "running": false,
    "runs": 37,
    "lastRunAt": "2026-08-22T09:14:00.104Z",
    "lastDurationMs": 268,
    "lastSymbolCount": 4,
    "lastAlertCount": 0,
    "lastFailureCount": 0,
    "lastSession": "open",
    "lastSkipReason": null,
    "skippedCycles": 112,
    "skippedOverlaps": 0,
    "suspensions": 0
  },
  "notifications": {
    "enabled": true,
    "cron": "* * * * *",
    "runs": 9,
    "lastSent": 1,
    "lastFailed": 0,
    "lastSkipped": 1,
    "lastHeld": 0,
    "totalSent": 14,
    "queue": { "pending": 0, "failed": 0, "sent": 14 }
  },
  "candleCache": {
    "entries": 6,
    "maxEntries": 500,
    "ttlSeconds": 300,
    "hits": 41,
    "misses": 8,
    "shared": 3,
    "evictions": 0,
    "expired": 2,
    "hitRate": 0.846
  }
}
```

Through Nginx these are reachable at `/api-health/` and `/api-health/ready`.

---

## Auth

### `GET /api/auth/config`

Public. Lets the login page explain itself when OAuth is not set up.

```json
{ "googleOAuthEnabled": true }
```

### `GET /api/auth/google`

Public. `302` to Google's consent screen and sets a 10-minute `sm_oauth_state` cookie.
Returns `503 OAUTH_NOT_CONFIGURED` when the server has no Google credentials.

### `GET /api/auth/google/callback`

Public, called by Google. Verifies the state cookie in constant time, creates or updates the user,
sets the `sm_token` cookie and `302`s to the frontend. On failure it redirects to
`/login?error=invalid_state|oauth_failed|access_denied` — it never renders an error page.

### `GET /api/auth/me`

Auth required.

```json
{
  "user": {
    "id": 1,
    "email": "trader@example.com",
    "name": "Trader",
    "avatarUrl": "https://lh3.googleusercontent.com/...",
    "createdAt": "2026-08-01T10:00:00.000Z"
  }
}
```

`google_id` is never exposed.

### `POST /api/auth/logout`

Clears the cookie. `200 { "ok": true }` whether or not a session existed.

---

## Stocks

All stock endpoints require auth — the provider key is a server credential and must not be usable
anonymously.

### `GET /api/stocks/search?q=<term>`

`q`: 2–50 characters. Options, warrants and non-primary listings are filtered out.

```json
{
  "query": "apple",
  "count": 1,
  "results": [
    { "symbol": "AAPL", "displaySymbol": "AAPL", "companyName": "APPLE INC", "type": "Common Stock" }
  ]
}
```

`422` when `q` is shorter than 2 characters.

### `GET /api/stocks/:symbol`

Profile, current quote and whether the caller follows it. Also upserts the local `stocks` row.

```json
{
  "stock": {
    "symbol": "AAPL",
    "companyName": "Apple Inc",
    "exchange": "NASDAQ NMS - GLOBAL MARKET",
    "currency": "USD",
    "country": "US",
    "logoUrl": "https://...",
    "industry": "Technology",
    "website": "https://www.apple.com/",
    "ipo": "1980-12-12",
    "marketCapitalization": 3210000,
    "isFavorite": true,
    "quote": {
      "symbol": "AAPL",
      "price": 201.5,
      "change": -1.25,
      "changePercent": -0.62,
      "high": 203,
      "low": 200,
      "open": 202,
      "previousClose": 202.75,
      "timestamp": "2026-08-22T19:59:58.000Z",
      "data": {
        "source": "provider",
        "marketSession": "open",
        "sessionLabel": null,
        "earlyClose": null,
        "exchangeTime": "15:59",
        "exchangeTimezone": "America/New_York",
        "isTradingDay": true,
        "asOf": "2026-08-22T19:59:58.000Z",
        "ageSeconds": 12,
        "live": true,
        "stale": false,
        "regularSessionOnly": false
      }
    }
  }
}
```

`404 STOCK_NOT_FOUND` for an unknown symbol, `422` for a malformed one.

### `GET /api/stocks/:symbol/quote`

The `quote` object above on its own. If the provider is unreachable but a polled price exists, the
last stored price is returned with `data.source: "cache"` and `data.stale: true` rather than an
error.

The `data` block is how the UI avoids presenting stale data as live:

| Field | Meaning |
| --- | --- |
| `marketSession` | `open`, `pre`, `post`, `closed`, `holiday` or `weekend`, from the exchange calendar |
| `sessionLabel` | Holiday name when the exchange is closed for one |
| `earlyClose` | Name of the half day, when the session ends at 13:00 ET |
| `exchangeTime` | Exchange wall clock (ET), not the server's |
| `live` | Provider quote from an open regular session, under two minutes old |
| `stale` | Cached, or older than two minutes during regular hours |
| `regularSessionOnly` | Outside regular hours: this is the last regular-session trade, not a live price |

### `GET /api/stocks/:symbol/candles?range=<range>`

`range`: `1m`, `1h`, `1d` (default), `1w`, `1mo`, `1y`.

Charts are served by Twelve Data by default (Finnhub gates candles behind a paid plan) and fall back
to Finnhub on an access error. See `CANDLE_PROVIDER` in the README.

```json
{
  "candles": {
    "symbol": "AAPL",
    "range": "1d",
    "resolution": "1day",
    "granularity": "day",
    "from": "2026-05-24T00:00:00.000Z",
    "to": "2026-08-22T00:00:00.000Z",
    "count": 2,
    "provider": "twelvedata",
    "currency": "USD",
    "exchange": "NASDAQ",
    "points": [
      { "time": "2026-08-21T00:00:00.000Z", "timestamp": 1787702400, "open": 200, "high": 203, "low": 199.5, "close": 202.4, "volume": 41230000 }
    ],
    "cache": { "hit": true, "ageSeconds": 42 }
  },
  "provider": "twelvedata",
  "cache": { "hit": true, "ageSeconds": 42 },
  "supportedRanges": ["1m", "1h", "1d", "1w", "1mo", "1y"]
}
```

`resolution` is the provider's own interval code (`1day` for Twelve Data, `D` for Finnhub);
`granularity` is provider-independent and is what the frontend formats axes by. `points` are always
oldest-first regardless of provider.

Responses are cached per symbol+range for `CANDLE_CACHE_TTL_MS` (default 5 minutes) and carry
`Cache-Control: private, max-age=<remaining TTL>`. `cache.hit` says whether this response came from
that cache, and `cache.ageSeconds` how old the cached copy was.

`count: 0` with an empty `points` array is a valid answer (no data for that window).
`502 PROVIDER_ACCESS_DENIED` means every configured provider rejected the request — usually a
missing or invalid key, or an interval outside the plan.
`429 RATE_LIMITED` can come from the provider: Twelve Data's free plan allows 8 requests a minute.

---

## Favorites

### `GET /api/favorites`

The caller's watchlist, joined with the newest polled quote. `quote` is `null` until the first poll.

```json
{
  "count": 1,
  "favorites": [
    {
      "id": 3,
      "createdAt": "2026-08-20T12:00:00.000Z",
      "stock": { "id": 7, "symbol": "AAPL", "companyName": "Apple Inc", "exchange": "NASDAQ", "currency": "USD", "logoUrl": null },
      "quote": {
        "price": 201.5, "change": -1.25, "changePercent": -0.62,
        "high": 203, "low": 200, "open": 202, "previousClose": 202.75,
        "rangePosition": 0.5,
        "timestamp": "2026-08-22T19:59:58.000Z", "updatedAt": "2026-08-22T20:00:03.221Z"
      },
      "alertCount": 2,
      "triggeredAlertCount": 0
    }
  ]
}
```

`rangePosition` is where the last trade sits in the session's range — `0` means it is on the low,
`1` on the high. Closing on the low is a different story from closing on the high even when the
percentage change is identical. `alertCount` is the number of armed thresholds the caller has on that
symbol.

### `POST /api/favorites/:symbol`

Idempotent. `201` when it was added, `200` when it was already there.

```json
{ "created": true, "favorite": { "symbol": "AAPL", "companyName": "Apple Inc" } }
```

`409 FAVORITE_LIMIT_REACHED` past 100 symbols.

### `DELETE /api/favorites/:symbol`

Always `200`. `removed` is `false` when the symbol was not on the list — removing something absent
is not an error.

```json
{ "removed": true }
```

---

## Alerts

An **alert rule** is the threshold you configure. An **alert** is a row written when a price crosses
it.

### `GET /api/alerts?symbol=<symbol>`

The caller's rules, newest first. `symbol` is optional.

```json
{
  "count": 1,
  "rules": [
    {
      "id": 12,
      "symbol": "AAPL",
      "companyName": "Apple Inc",
      "type": "BUY",
      "condition": "BELOW",
      "threshold": 200,
      "enabled": true,
      "triggered": false,
      "suspendedAt": null,
      "suspendedReason": null,
      "cooldownMinutes": 0,
      "expiresAt": null,
      "marketHoursOnly": false,
      "trailPercent": null,
      "referencePrice": null,
      "firedCount": 0,
      "lastTriggeredAt": null,
      "createdAt": "2026-08-21T09:00:00.000Z",
      "updatedAt": "2026-08-21T09:00:00.000Z"
    }
  ]
}
```

A rule with `suspendedAt` set was paused by a suspected corporate action and fires nothing until it
is confirmed — see `POST /api/alerts/:id/resume`.

### `POST /api/alerts`

```json
{ "symbol": "AAPL", "type": "BUY", "condition": "BELOW", "threshold": 200, "enabled": true }
```

| Field | Rules |
| --- | --- |
| `symbol` | required, 1–15 chars of `A-Z0-9.-` |
| `type` | required, `BUY` or `SELL` |
| `condition` | required, `ABOVE` or `BELOW` |
| `threshold` | required, > 0, ≤ 1 000 000 |
| `enabled` | optional, defaults to `true` |
| `cooldownMinutes` | optional, 0–10080. Minimum gap between firings |
| `expiresAt` | optional ISO date. The rule is ignored after it |
| `marketHoursOnly` | optional boolean. Ignore extended-hours prints |
| `trailPercent` | optional, 0 < n < 100. Makes it a trailing rule |

A `trailPercent` rule defends a distance from the extreme price seen since it was armed rather than a
fixed number: the level ratchets in the favourable direction and never moves back. `threshold` is
still required as the starting level for the first poll, and `referencePrice` is seeded from the
current quote at creation.

`201 { "rule": { ... } }`. `409 ALERT_RULE_EXISTS` for an identical rule on the same symbol,
`409 ALERT_LIMIT_REACHED` past 200 rules, `422` on validation failure.

### `PATCH /api/alerts/:id`

Any subset of the create fields; an empty body is `422`.

Changing `threshold` or `condition`, or setting `enabled: true`, clears the trigger latch **and** any
corporate-action suspension — a deliberate edit is the owner confirming what the rule means.
Changing `trailPercent` also clears `referencePrice`, so the trail re-measures from the current price.
`200 { "rule": { ... } }`, or `404 ALERT_RULE_NOT_FOUND` — including when the rule belongs to someone
else.

### `POST /api/alerts/:id/resume`

Confirms a rule that a corporate action paused, clearing `suspendedAt` and re-arming it.
`200 { "rule": { ... } }`, or `404 ALERT_RULE_NOT_FOUND`.

### `DELETE /api/alerts/:id`

`204` with no body. `404 ALERT_RULE_NOT_FOUND` if it is not the caller's.

### `GET /api/alerts/history?limit=&offset=&unacknowledged=`

| Param | Default | Range |
| --- | --- | --- |
| `limit` | 50 | 1–100 |
| `offset` | 0 | ≥ 0 |
| `unacknowledged` | `false` | `true` / `false` |

```json
{
  "items": [
    {
      "id": 88,
      "alertRuleId": 12,
      "symbol": "AAPL",
      "companyName": "Apple Inc",
      "kind": "THRESHOLD",
      "type": "BUY",
      "condition": "BELOW",
      "triggerPrice": 195.0,
      "triggerKind": "INTERVAL_LOW",
      "threshold": 200,
      "message": "AAPL traded through your BUY threshold of $200.00 (low $195.00), and is now at $207.00.",
      "triggeredAt": "2026-08-22T14:31:00.512Z",
      "acknowledgedAt": null
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

Alerts keep their own copy of `symbol`, `type`, `condition` and `threshold`, so history stays
readable after the rule is edited or deleted.

`kind` is `THRESHOLD` for a rule firing, or `SYSTEM` for a notice such as alerts being paused by a
corporate action. System notices have no `condition`, `triggerPrice` or `threshold`.

`triggerKind` says what the rule was judged on: `LAST` for the last trade, or `INTERVAL_HIGH` /
`INTERVAL_LOW` for an extreme observed between two polls — a crossing that had already reversed by
the time the poller looked.

### `POST /api/alerts/:id/acknowledge`

Idempotent — acknowledging twice keeps the first timestamp. `200 { "alert": { ... } }`, or
`404 ALERT_NOT_FOUND`.

---

## Risk

### `GET /api/stocks/:symbol/risk?range=&positionValue=`

Volatility and drawdown for a timeframe, expressed in dollars against a position size. Computed from
the cached candles, so it costs no extra provider request.

| Param | Default | Notes |
| --- | --- | --- |
| `range` | `1d` | Same keys as the candles endpoint |
| `positionValue` | 1000 | The amount the dollar figures are expressed against |

```json
{
  "symbol": "AAPL",
  "range": "1d",
  "risk": {
    "granularity": "day",
    "bars": 62,
    "typicalMovePercent": 1.48,
    "typicalRangePercent": 1.92,
    "volatilityPercent": 1.83,
    "annualizedVolatilityPercent": 29.05,
    "worstBarPercent": -4.71,
    "bestBarPercent": 5.02,
    "windowReturnPercent": 3.4,
    "maxDrawdown": {
      "percent": -12.71,
      "peakPrice": 340.1, "peakAt": "2026-07-02T00:00:00.000Z",
      "troughPrice": 296.9, "troughAt": "2026-07-29T00:00:00.000Z",
      "days": 27
    },
    "positionValue": 1000,
    "typicalDailySwing": 14.79,
    "worstBarLoss": 47.1,
    "drawdownLoss": 127.1,
    "band": "normal"
  },
  "basis": "Measured from past prices in this window. It describes what has happened, not what will."
}
```

`risk` is `null` when fewer than three usable closes exist — a two-point series cannot support a
volatility figure, so the endpoint says nothing rather than publishing a meaningless zero. `band` is
one of `steady`, `normal`, `lively`, `wild` and exists only to pick plain-language wording in the UI.

---

## Paper trading

Simulated orders at real quotes, with modelled costs. Nothing here touches real money or real markets.

### `GET /api/paper/portfolio`

Creates the account on first call with `PAPER_STARTING_CASH`.

```json
{
  "portfolio": {
    "cash": 8974.12, "startingCash": 10000, "positionsValue": 1021.5, "equity": 9995.62,
    "totalReturn": -4.38, "totalReturnPercent": -0.04,
    "realizedPnl": 0, "unrealizedPnl": -4.38,
    "totalCostsPaid": 4.38, "costDragPercent": 0.04,
    "tradeCount": 1, "resetCount": 0, "cashPercent": 89.8,
    "openedAt": "2026-08-22T09:00:00.000Z"
  },
  "positions": [
    {
      "symbol": "AAPL", "quantity": 5, "avgCost": 205.1, "breakEvenPrice": 205.1,
      "price": 204.3, "priceKnown": true, "dayChangePercent": -0.4,
      "marketValue": 1021.5, "costBasis": 1025.5,
      "unrealizedPnl": -4, "unrealizedPnlPercent": -0.39,
      "allocationPercent": 10.2
    }
  ]
}
```

`avgCost` includes the costs paid, so `breakEvenPrice` is the real break-even. A freshly opened
position is therefore slightly negative — which is true of real ones too.

### `POST /api/paper/orders/preview`

```json
{ "symbol": "AAPL", "side": "BUY", "quantity": 5 }
```

Prices the order without placing it. Moves no money.

```json
{
  "symbol": "AAPL",
  "order": {
    "side": "BUY", "quantity": 5,
    "quotePrice": 204.3, "fillPrice": 204.44,
    "spreadBps": 14, "spreadCost": 0.72, "commission": 0,
    "notional": 1022.2, "totalCost": 0.72, "cashDelta": -1022.2,
    "breakEvenMovePercent": 0.0704
  },
  "quote": { "price": 204.3, "changePercent": -0.4 },
  "cashAfter": 8977.8,
  "affordable": true,
  "maxAffordableQuantity": 48,
  "heldQuantity": 0,
  "marketOpen": true,
  "marketSession": "open",
  "wouldQueue": false
}
```

`breakEvenMovePercent` is how far the price must move just to cover this trade's costs.
`wouldQueue` is true outside regular hours.

### `POST /api/paper/orders`

Same body. `201` on fill.

```json
{
  "trade": { "id": 12, "symbol": "AAPL", "side": "BUY", "quantity": 5, "fillPrice": 204.44, "…": "…" },
  "cash": 8977.8,
  "costs": { "spreadCost": 0.72, "commission": 0, "totalCost": 0.72, "breakEvenMovePercent": 0.0704 },
  "realizedPnl": null,
  "filledWhileClosed": false,
  "lesson": null
}
```

`realizedPnl` is set on sells only. `lesson` carries a plain-language note when one applies — for
example that a real broker would have queued an after-hours order to the next open.

Refused with `400` and an explanation when: cash is short (the message states the shortfall), the
user does not hold what they are selling, the sell exceeds the holding, or the notional exceeds
`PAPER_MAX_ORDER_VALUE`. Short selling is not supported. A refused order writes nothing.

### `GET /api/paper/trades?limit=&offset=&symbol=`

The ledger, newest first, with `spreadCost`, `commission`, `realizedPnl`, `filledWhileClosed` and
`marketSession` per trade.

### `GET /api/paper/scorecard`

```json
{
  "since": "2026-08-22T09:04:00.000Z",
  "daysActive": 1,
  "tradesPerMonth": 90,
  "you": {
    "startingCash": 10000, "equity": 9995.62, "returnPercent": -0.04,
    "realizedPnl": -2.1, "unrealizedPnl": 0, "tradeCount": 3,
    "costsPaid": 4.38, "costDragPercent": 0.04,
    "positionCount": 0, "largestAllocationPercent": 0
  },
  "benchmark": {
    "symbol": "SPY", "label": "S&P 500 (SPY)",
    "startPrice": 612.4, "endPrice": 624.8, "returnPercent": 2.02
  },
  "buyAndHoldEquity": 10202,
  "differencePercent": -2.06,
  "verdict": "behind",
  "observations": [{ "id": "costs", "tone": "warn", "text": "Costs have taken $4.38 — …" }],
  "equityCurve": [{ "date": "2026-08-22", "equity": 9995.62, "cash": 8977.8, "positionsValue": 1021.5 }]
}
```

`benchmark` is `null` before the first trade, or when the provider cannot serve SPY — the scorecard
then degrades to the user's own figures rather than failing.

### `POST /api/paper/reset`

Clears positions, trades and snapshots, restores the starting cash, and increments `resetCount`.

---

## Learning

### `GET /api/learn/progress`

Onboarding state. Step completion is **derived from real activity** (favorites, rules, trades), not
tracked by the client, so it cannot be faked by clicking through a tour and it survives a new device.

```json
{
  "onboarding": {
    "steps": [{ "id": "watch", "title": "Add it to your watchlist", "complete": false, "action": { "label": "Open a stock", "to": "/" }, "lesson": "reading-a-chart" }],
    "completedCount": 2, "totalCount": 5, "finished": false,
    "dismissed": false, "lessonsRead": ["what-costs-you"],
    "nextStep": { "id": "watch", "…": "…" }
  }
}
```

### `POST /api/learn/lessons/:id/read`

Marks a lesson read (ids are lowercase-kebab). Returns the updated onboarding state.

### `POST /api/learn/checklist/dismiss`

`{ "dismissed": true }` hides the checklist.

### `GET /api/learn/market-clock`

The session plus when it next changes, so the UI can say "opens in 3h 24m" rather than leaving a
beginner to wonder why a price is not moving.

```json
{
  "clock": {
    "session": "closed", "isTradingDay": true, "holiday": null, "earlyClose": null,
    "exchangeDate": "2026-08-21", "exchangeTime": "20:14", "timezone": "America/New_York",
    "nextOpen": { "at": "2026-08-24T13:30:00.000Z", "date": "2026-08-24", "msUntil": 235000000 },
    "nextClose": null
  }
}
```

---

## User

### `GET /api/user/profile`

Same shape as `/api/auth/me`.

### `GET /api/user/summary`

```json
{
  "summary": { "favorites": 4, "alertRules": 3, "activeAlertRules": 2, "unacknowledgedAlerts": 1 }
}
```

### `GET /api/user/notifications`

```json
{
  "settings": {
    "userId": 1,
    "emailEnabled": true,
    "webhookUrl": "https://hooks.slack.com/services/…",
    "webhookEnabled": true,
    "quietHoursStart": 22,
    "quietHoursEnd": 7,
    "timezone": "America/New_York",
    "channels": {
      "email": { "available": false, "enabled": true },
      "webhook": { "available": true, "enabled": true }
    }
  },
  "deliveries": [{ "channel": "webhook", "status": "sent", "count": 12 }]
}
```

`channels.*.available` reflects server configuration: email needs `SMTP_URL`. An enabled but
unavailable channel records its deliveries as `skipped` rather than dropping them.

### `PUT /api/user/notifications`

```json
{
  "emailEnabled": true,
  "webhookEnabled": true,
  "webhookUrl": "https://hooks.slack.com/services/T000/B000/xyz",
  "quietHoursStart": 22,
  "quietHoursEnd": 7,
  "timezone": "America/New_York"
}
```

Quiet hours must be set as a pair or not at all (`422` otherwise) and may wrap past midnight. They
are evaluated in `timezone` and **hold** price alerts until the window ends; `SYSTEM` notices are
never held.

`webhookUrl` must be a public HTTPS URL. Loopback, private, link-local and cloud-metadata addresses,
bare hostnames and embedded credentials are rejected with `400` — the server fetches this URL, so an
unvalidated one is an SSRF vector. Clearing the URL also disables the channel.
