# Stackr — learn how the market works

A stock monitoring app built as a beginner's guide. Watch real prices, practise with fake money, and
find out what each thing on the screen actually means.

- **Search** any US-listed symbol and open its detail page
- **Chart** price history at minute, hour, day, week, month and year resolution, with every mark on
  the chart explained in plain language
- **Watchlist** the symbols you care about, with prices refreshed server-side
- **Threshold alerts** — buy/sell rules that fire once per crossing and re-arm when the price moves
  back, delivered by email or webhook
- **Practice account** — simulated trading at real quotes, with real costs, and a scorecard that
  compares you against simply holding the index
- **Risk in your own numbers** — what a stock's volatility means in dollars for the amount *you* are
  considering
- **Lessons and a glossary** written for someone who has never bought a share
- **Google sign-in**, with the session held in an HTTP-only cookie

It explains mechanics and never suggests what to buy.

The browser never talks to a market data provider. React calls the Express API, Express calls the
providers and PostgreSQL, and Nginx is the only thing exposed publicly.

Two providers, split by what each does well: **Finnhub** for quotes, search and company profiles,
**Twelve Data** for historical candles — Finnhub gates candles behind a paid plan. Both sit behind
the same service layer, so the API contract and the chart do not change with the provider.

```
            Internet
               │
          ┌────▼────┐
          │  Nginx  │  :8080
          └──┬───┬──┘
     /       │   │        /api/*
 ┌───────────▼┐ ┌▼──────────────┐
 │ React SPA  │ │  Express API  │
 │ (static)   │ └──┬────┬───┬───┘
 └────────────┘    │    │   │
        ┌──────────▼┐ ┌─▼──────────────┐ ┌▼────────────┐
        │ PostgreSQL│ │ Finnhub quotes │ │ node-cron   │
        │           │ │ Twelve Data    │ │ poller      │
        │           │ │   candles      │ │ (every 5m)  │
        └───────────┘ └────────────────┘ └─────────────┘
```

## Stack

| Layer | Choice | Version |
| --- | --- | --- |
| Runtime | Node.js (containers) | 24 LTS (`node:24-alpine`) |
| Frontend | React / Vite / TailwindCSS / Recharts | 19.2 / 8.2 / 4.3 / 3.10 |
| Routing | react-router-dom | 7.18 |
| Backend | Express / Axios / pg / node-cron | 5.2 / 1.19 / 8.23 / 4.6 |
| Auth | Passport (Google OAuth 2.0) + JWT | 0.7 / 9.0 |
| Database | PostgreSQL | 18 (`postgres:18-alpine`) |
| Proxy | Nginx | 1.x (`nginx:1-alpine`) |

Vite 8 requires Node ≥ 22.12, so the containers run Node 24 LTS. Tailwind 4 is wired through
`@tailwindcss/vite` — there is no `tailwind.config.js` or PostCSS step; the theme lives in
`frontend/src/index.css` under `@theme`.

## Quick start (Docker)

You need Docker with Compose v2, a [Finnhub API key](https://finnhub.io/dashboard), a
[Twelve Data API key](https://twelvedata.com/account/api-keys), and a Google OAuth 2.0 client. All
three have a usable free tier.

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Where it comes from |
| --- | --- |
| `POSTGRES_PASSWORD` | pick one: `openssl rand -base64 24` |
| `JWT_SECRET` | `openssl rand -base64 48` |
| `FINNHUB_API_KEY` | finnhub.io dashboard — quotes, search, profiles |
| `TWELVEDATA_API_KEY` | twelvedata.com API keys — charts |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud console (see below) |

In the [Google Cloud console](https://console.cloud.google.com/apis/credentials), create an OAuth
2.0 Client ID of type **Web application** and add:

- Authorised JavaScript origin: `http://localhost:8080`
- Authorised redirect URI: `http://localhost:8080/api/auth/google/callback`

Then:

```bash
docker compose up --build
```

Open <http://localhost:8080>. Migrations run automatically on backend start.

If port 8080 is taken, set `PUBLIC_PORT` to something free and update `FRONTEND_URL`,
`BACKEND_URL` and the Google redirect URI to match — they must all agree, or the OAuth redirect
will bounce.

Useful checks:

```bash
curl -s localhost:8080/api-health/            # nginx -> express liveness
curl -s localhost:8080/api-health/ready | jq  # database + configuration readiness
docker compose ps                             # health status of all four services
docker compose logs -f backend                # poller output, one line per cycle
```

## Local development (no Docker for the app)

Postgres still comes from Docker; the app runs on the host.

```bash
docker compose up -d postgres

# backend — reads the repo-root .env, so point DATABASE_URL at localhost
cd backend && npm install && npm run dev

# frontend — Vite proxies /api to localhost:3000
cd frontend && npm install && npm run dev
```

With the app on Vite's port, set `FRONTEND_URL=http://localhost:5173` and the Google redirect URI
to `http://localhost:3000/api/auth/google/callback`, and set `BACKEND_URL=http://localhost:3000`.

Uncomment the `ports` block on the `postgres` service in `docker-compose.yml` to reach the database
from the host, and set `DATABASE_URL=postgresql://stockmonitor:<password>@localhost:5432/stockmonitor`.

## Tests

```bash
cd backend && npm test     # 212 tests
cd frontend && npm test    # 16 tests
```

212 tests. Units cover alert latching and interval-extreme triggering, cooldown/expiry/session
filters, trailing-stop ratcheting, the market calendar (DST both ways, holidays, half days), split
detection, candle caching, provider selection and fallback, quiet hours, webhook URL validation,
provider normalization, the trading cost model, and the risk metrics. On top of that, HTTP integration
tests run the real router, controllers, services and validation with only PostgreSQL and the provider
clients faked.

The trading tests assert the invariant that matters most: a round trip with no price move must *lose*
money, equity can only fall by the costs charged, and a refused order leaves no trace.

The suite deliberately does **not** read your `.env`: a test run that picked up real keys would make
live provider calls and pass or fail depending on whose machine it ran on.

They assert the things that would quietly break: unauthenticated access, user isolation on every
user-scoped route, favorite idempotency, alert deduplication, crossings that reverse between polls,
and the error envelope.

The frontend suite (vitest + jsdom + Testing Library) covers `HelpTip`, the one piece of genuinely
tricky DOM work: that the bubble really lands outside a clipping ancestor, flips when it would run
off the top, clamps at the right edge, and closes on Escape, outside click and scroll.

## Teaching, not just monitoring

The app assumes the reader has never traded. Three things carry that, and each one is built so it
cannot quietly lie to a beginner.

### The practice account

Simulated trading at real quotes. Cash and position move together inside one transaction with the
portfolio row locked, so two concurrent orders cannot spend the same cash and no accounting slip can
invent money. Short selling is not supported — it is not a beginner's tool.

**Costs are charged on purpose.** A simulator that fills at the mid price for free teaches that
trading is free and that the price on the screen is the price you get. Neither is true:

- You buy at the ask and sell at the bid, so a round trip loses the spread before the price has moved
  at all. Buy and immediately sell in Stackr and you end up with slightly less money — that is the
  most useful thing the simulator can show.
- The spread is estimated from each instrument's **own daily range** rather than a flat number,
  because that is how spreads behave: a heavily traded large-cap costs a basis point or two to cross,
  a thin volatile one costs far more. Beginners are drawn to exactly the volatile names where this
  matters, so a flat estimate would hide the lesson.
- Average cost includes what was paid in costs, so the break-even price shown is the real one.
- The trade ticket previews the fill price, the spread, and how far the price must move just to break
  even — *before* the order is placed.

Orders placed while the market is shut still fill, so someone can practise at 10pm, but the
confirmation says plainly that a real broker would have queued it to the next open at a possibly very
different price.

### The scorecard

The learner's return next to the **only benchmark that matters: doing nothing**. It fetches SPY over
the same period and shows both, plus total costs paid as a percentage of starting money, and
observations in plain sentences — concentration, trading frequency, cost drag.

This is the feature an engagement-driven app would bury. Most active retail traders underperform a
broad index, and costs plus timing are why; showing it from the user's own trades is far more
persuasive than saying it. The copy is careful not to over-read a short sample either: being ahead
over a few weeks is mostly luck, and it says so.

### Risk in dollars, not jargon

"Annualised standard deviation of 32%" means nothing to a beginner. "$1,000 in this would swing about
$15 on an average day, and would have been down $127 at the worst point in this window" means a lot.
Same data, computed from candles already in the cache, so it costs no extra provider call:

| Shown | Why it is the number that matters |
| --- | --- |
| Typical daily move, in % and in dollars on a size you pick | Tells you whether the position is the wrong size for you |
| Worst single day | Already happened once, so it is not a worst case |
| Worst drawdown, with dates and duration | What you'd have suffered buying at the worst moment — the real test of whether you can hold |
| Annualised volatility | The standard measure, for comparing one stock against another |

Every figure is labelled as describing what has happened, never what will.

### Getting started, and lessons

A five-step checklist whose steps are **derived from what the user actually did** — followed a symbol,
set a threshold, placed a trade, read the lesson on the odds. It cannot be satisfied by clicking
through a tour, and it survives a new device. Eight short lessons sit alongside it, in the order a
beginner meets the ideas, each with a concrete number and a takeaway. A market clock in the header
says whether the market is open and when it next changes, because "why hasn't this moved in hours?"
is a question nobody should have to ask.

### Explaining the charts

Every mark on a chart and every watchlist column carries a plain-language explanation for readers
who have not traded before — what it is, plus a concrete example, no jargon defined with more jargon.
The copy lives in one place, `frontend/src/utils/glossary.js`, so the wording stays consistent
wherever a term appears.

`HelpTip` renders through a **React portal** into `document.body`. That is not incidental: the
triggers sit inside chart panels and a scrolling table that clip their own overflow and create
stacking contexts, so an absolutely positioned bubble would be cut off or painted under the next
panel. The trade-off is manual positioning against the trigger's viewport rect — hence the flip,
clamp and close-on-scroll behaviour. Hover, keyboard focus and tap all open it; Escape, an outside
click or a scroll closes it.

## How it works

### Alert latching

A rule fires on the transition into its condition, not while it stays there. For *BUY AAPL below
$200*:

| Price | Result |
| --- | --- |
| $201 | nothing — condition not met |
| $199 | **triggers** — condition met, latch was open |
| $198 | nothing — already latched |
| $201 | latch resets |
| $199 | **triggers** again |

The latch (`alert_rules.triggered`) lives in PostgreSQL, so restarts do not cause a re-fire.
Editing a threshold or condition, or re-enabling a rule, clears the latch so the new configuration
can fire.

### Crossings between polls

The poller samples every 5 minutes, so judging a rule on the *last* price would miss a threshold
that was crossed and reversed in between — a real crossing the trader never hears about.

Each quote carries the session high and low. If this poll reports a lower low than the previous one
did, that low can only have happened in the interval just elapsed, and that is the price the rule is
judged against:

| Poll | Last | Session low | Result for *BUY below $200* |
| --- | --- | --- | --- |
| 10:00 | $207 | $205 | nothing |
| 10:05 | $207 | **$195** | **triggers** at $195 — it traded through the line |

Two details matter. The **first observation of a session** uses only the last trade, because the
day's low may predate the rule. And the latch **resets on the last trade**, not on an extreme: if the
price is already back above the line the rule re-arms immediately, so a second dip in the next
interval fires again. Alerts record which it was in `trigger_kind`
(`LAST` / `INTERVAL_HIGH` / `INTERVAL_LOW`), and the UI says "caught between polls".

### Corporate actions

A threshold is an absolute number, so a 4-for-1 split would put every rule on the wrong side of a
price that did not really move. The poller compares the provider's previous close against the price
it last stored: both describe the same prior session, so a large disagreement means the series was
re-based rather than that the market moved. A genuine overnight gap moves the *current* price away
from the previous close but leaves the previous close intact, which is what separates news from a
split.

On detection, every rule on that symbol is suspended, each owner gets a system notice explaining
why, and nothing fires until the owner confirms the threshold still means what they intended.

### Alert hygiene

| Option | Default | What it is for |
| --- | --- | --- |
| `cooldownMinutes` | 0 | A price chopping around your level would otherwise alert you repeatedly |
| `expiresAt` | none | A threshold set for one specific setup should not stay armed forever |
| `marketHoursOnly` | false | Ignore thin, unrepresentative extended-hours prints |
| `trailPercent` | none | Trailing rule: the level follows the extreme price since the rule was armed |

A trailing rule is what a stop-loss actually is. `trailPercent: 8` on a `BELOW` rule tracks the
highest price seen (`reference_price`) and defends 8% under it; the level ratchets up with the market
and never moves back down. Changing the trail distance re-measures from the current price.

### Notification delivery

An alert nobody receives is only a log entry. Deliveries are rows in `alert_deliveries`, queued **in
the same transaction as the alert**, so an alert cannot exist without its delivery intent, and a
failed send is retried rather than lost. A separate `node-cron` job drains the queue, claiming rows
with `FOR UPDATE SKIP LOCKED` so several API containers never send the same alert twice.

| Channel | Needs | Notes |
| --- | --- | --- |
| Webhook | nothing server-side | JSON POST to a URL the user sets. Works with Slack and Discord incoming webhooks as-is |
| Email | `SMTP_URL` | Disabled cleanly when unset — the delivery is recorded as `skipped`, not dropped |

Users set channels and quiet hours at `/account`. Quiet hours are evaluated in the user's own
timezone (a wall-clock statement) and **hold** price alerts rather than dropping them; system
notices about paused rules always go through.

Webhook URLs are validated as public HTTPS at save time *and* at send time, rejecting private,
loopback, link-local and cloud-metadata addresses, with redirects not followed — a URL the server
fetches on a user's behalf is an SSRF vector otherwise.

### Market calendar

Sessions come from the exchange's own timezone via `America/New_York`, not a fixed UTC offset: 09:30
ET is 13:30 UTC in summer and 14:30 UTC in winter, so a hardcoded offset mislabels the first hour of
trading for half the year. Holidays are computed per year (including Good Friday from the Easter
algorithm, and NYSE's Saturday/Sunday observance rules), along with the three 13:00 half days.

The poller skips weekends, holidays and overnight entirely (`POLL_SKIP_WHEN_CLOSED`), which is both
honest and free: nothing trades then, so a cycle would spend provider quota re-reading an unchanged
price. It still runs during extended hours, when gaps happen.

### Polling

One `node-cron` schedule serves every user — never one job per user or per alert. It runs every 5
minutes by default (`POLL_CRON=*/5 * * * *`), which keeps threshold checks timely while staying well
inside the providers' free-tier quotas. Each cycle:

1. `SELECT DISTINCT` the symbols that are favorited or under an enabled rule
2. fetch each symbol's quote **once**, at most `POLL_CONCURRENCY` in flight
3. write `latest_prices`
4. evaluate every user's rules for that symbol against that one quote

If 500 users watch AAPL, that is one Finnhub request. A failure on one symbol is logged and the
cycle continues with the rest.

### Market data strategy

PostgreSQL holds application state only: users, stock metadata, favorites, alert rules, triggered
alerts and the latest quote per symbol. Historical candles are fetched on demand when the chart
timeframe changes, and are never stored in the database. The backend maps UI ranges to each
provider's own interval codes, so the frontend only ever sends `range=1d`:

| Range | Twelve Data interval | Finnhub resolution | Window |
| --- | --- | --- | --- |
| `1m` | `1min` | `1` | 1 day |
| `1h` | `1h` | `60` | 7 days |
| `1d` | `1day` | `D` | 90 days |
| `1w` | `1week` | `W` | 1 year |
| `1mo` | `1month` | `M` | 5 years |
| `1y` | `1month` | `M` | 20 years |

### Which provider serves charts

`CANDLE_PROVIDER` picks the chart source:

- `auto` (default) — Twelve Data when its key is set, otherwise Finnhub. On a `PROVIDER_ACCESS_DENIED`
  or missing-key error it tries the other one, so a paywall on one provider does not become a broken
  chart. Real data errors (unknown symbol, rate limit) are **not** retried elsewhere — they surface.
- `twelvedata` / `finnhub` — pin one provider and disable fallback.

Finnhub's `/stock/candle` requires a paid plan, which is why `auto` prefers Twelve Data. Quotes,
search, profiles, the watchlist and the whole alert pipeline stay on Finnhub's free tier.

The candles response says who answered:

```json
{ "candles": { "provider": "twelvedata", "...": "..." }, "provider": "twelvedata", "cache": { "hit": true, "ageSeconds": 42 } }
```

### Candle caching

Candles are cached in-process per `symbol:range` for `CANDLE_CACHE_TTL_MS` (default 5 minutes), and
concurrent misses for the same key share a single provider request. Twelve Data's free plan allows 8
requests a minute, so this is what keeps a few people opening the same chart from tripping the
limit. Only successes are cached — a failed fetch never sticks. The response also carries
`Cache-Control: private, max-age=<remaining TTL>`, so a browser re-request inside the window costs
nothing at all.

Cache stats (entries, hit rate, evictions) are reported by `/health/ready`. Set
`CANDLE_CACHE_TTL_MS=0` to disable. The cache is deliberately in-process: one API container needs no
Redis for this, and swapping in Redis later means replacing `services/market/candleCache.js`, not its
callers.

### Data freshness

Quotes carry a `data` block with the market session, exchange time, the quote's age, and `live` /
`stale` / `regularSessionOnly` flags. Outside regular hours the provider's free tier returns the last
*regular-session* trade, so the UI says exactly that instead of presenting it as current. Cached and
delayed prices are labelled too.

Extended-hours **bars** are available on the chart only where the Twelve Data plan includes them
(`TWELVEDATA_PREPOST=true`, intervals ≤ 30min). Left enabled on a plan without it, the first
rejection makes the app fall back to regular-session bars for the rest of the process rather than
breaking the chart.

## API

All responses are JSON. Errors always use one envelope:

```json
{ "error": { "code": "STOCK_NOT_FOUND", "message": "The requested stock could not be found." } }
```

`details` is added for validation failures. Stack traces appear only outside production.

Full reference: [`docs/api.md`](docs/api.md).

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | — | Liveness |
| GET | `/health/ready` | — | Database + configuration readiness |
| GET | `/api/auth/config` | — | Whether Google sign-in is configured |
| GET | `/api/auth/google` | — | Start OAuth |
| GET | `/api/auth/google/callback` | — | Finish OAuth, set the cookie |
| GET | `/api/auth/me` | ✓ | Current user |
| POST | `/api/auth/logout` | — | Clear the cookie |
| GET | `/api/stocks/search?q=` | ✓ | Symbol search |
| GET | `/api/stocks/:symbol` | ✓ | Profile + quote + favorite flag |
| GET | `/api/stocks/:symbol/quote` | ✓ | Current quote |
| GET | `/api/stocks/:symbol/candles?range=` | ✓ | Historical candles |
| GET | `/api/favorites` | ✓ | Watchlist with latest prices |
| POST | `/api/favorites/:symbol` | ✓ | Add (idempotent) |
| DELETE | `/api/favorites/:symbol` | ✓ | Remove (never errors) |
| GET | `/api/alerts` | ✓ | Alert rules |
| POST | `/api/alerts` | ✓ | Create a rule |
| PATCH | `/api/alerts/:id` | ✓ | Update a rule |
| DELETE | `/api/alerts/:id` | ✓ | Delete a rule |
| GET | `/api/alerts/history` | ✓ | Triggered alerts |
| POST | `/api/alerts/:id/acknowledge` | ✓ | Mark one read |
| POST | `/api/alerts/:id/resume` | ✓ | Re-arm a rule paused by a corporate action |
| GET | `/api/stocks/:symbol/risk` | ✓ | Volatility and drawdown, in dollars on a size you pick |
| GET | `/api/paper/portfolio` | ✓ | Practice account, positions and P/L |
| POST | `/api/paper/orders/preview` | ✓ | Price an order, costs included, without placing it |
| POST | `/api/paper/orders` | ✓ | Place a simulated order |
| GET | `/api/paper/trades` | ✓ | Trade ledger with per-trade costs |
| GET | `/api/paper/scorecard` | ✓ | You vs buy-and-hold |
| POST | `/api/paper/reset` | ✓ | Start the practice account over |
| GET | `/api/learn/progress` | ✓ | Getting-started state, derived from activity |
| POST | `/api/learn/lessons/:id/read` | ✓ | Mark a lesson read |
| POST | `/api/learn/checklist/dismiss` | ✓ | Hide the checklist |
| GET | `/api/learn/market-clock` | ✓ | Session, plus next open and close |
| GET | `/api/user/profile` | ✓ | Profile |
| GET | `/api/user/summary` | ✓ | Dashboard counts |
| GET | `/api/user/notifications` | ✓ | Delivery channels and quiet hours |
| PUT | `/api/user/notifications` | ✓ | Update them |

## Layout

```
stackr/
├── backend/            Express API, services, poller, migrations runner
│   ├── src/
│   │   ├── config/         env parsing and feature gates
│   │   ├── controllers/    thin HTTP handlers
│   │   ├── db/             pool, migrate, repositories/
│   │   ├── jobs/           node-cron scheduler + poll cycle
│   │   ├── middleware/     auth, validation, rate limits, errors, logging
│   │   ├── routes/         route tables and request schemas
│   │   └── services/       finnhub/ market/ alerts/ auth/
│   └── tests/
├── frontend/           React SPA (Vite, Tailwind 4, Recharts)
│   └── src/            components/ pages/ layouts/ hooks/ services/ context/ utils/
├── database/migrations/  numbered, checksum-verified SQL
├── nginx/              public entry point
├── docs/api.md
└── docker-compose.yml
```

Dockerfiles live next to the service they build (`backend/`, `frontend/`, `nginx/`) so each build
context stays minimal.

## Security notes

- `FINNHUB_API_KEY`, `TWELVEDATA_API_KEY`, database credentials and `JWT_SECRET` are server-side
  only; the Finnhub key travels in a header, and the Twelve Data key (which the provider only accepts
  as a query parameter) is never logged — provider logging records the path, never the URL or params
- JWT is stored in an HTTP-only cookie (`Secure` in production, `SameSite=Lax`), never in
  `localStorage`
- OAuth CSRF state is a short-lived HTTP-only cookie compared in constant time
- every SQL statement is parameterized; multi-step writes run in transactions
- user-scoped routes filter by the authenticated user id in SQL, so one user cannot read or modify
  another's favorites or alerts
- helmet security headers, per-user/per-IP rate limits, and a 100 kB body cap
- logs redact cookies, authorization headers, tokens and keys; production responses carry no stack
  traces
- PostgreSQL is not published to the host in the default compose file

## Not in this version

Redis caching (candles use an in-process cache instead), WebSockets, technical indicators, portfolio
and cost-basis tracking, news and fundamentals, an earnings calendar, candlestick and volume panes,
bid/ask and spread data, and non-US listings. The service layer is where each of these would attach.

Known limitations, stated rather than hidden:

- **Extended-hours quotes.** Finnhub's free `/quote` is regular-session only, so outside those hours
  the price shown is the last regular-session trade and is labelled as such. There is no free
  pre/post quote source wired in.
- **Dividends.** The corporate-action guard catches splits, not the 0.5–2% ex-dividend adjustment,
  which is small enough to look like an ordinary move. An ex-dividend drop can therefore trigger a
  threshold legitimately-but-unhelpfully.
- **Interval extremes depend on the provider's session high/low.** If the provider's own high/low is
  stale, a crossing inside that window can still be missed. Per-minute candles for every watched
  symbol would close the gap at a much higher request cost.
