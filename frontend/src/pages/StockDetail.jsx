import { Suspense, lazy, useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AlertForm } from '../components/AlertForm.jsx';
import { AlertList } from '../components/AlertList.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { FavoriteButton } from '../components/FavoriteButton.jsx';
import { Loading } from '../components/Loading.jsx';
import { PriceDisplay } from '../components/PriceDisplay.jsx';
import { RangeSelector } from '../components/RangeSelector.jsx';
import { RiskPanel } from '../components/RiskPanel.jsx';
import { TradeTicket } from '../components/TradeTicket.jsx';
import useAsync from '../hooks/useAsync.js';
import alertApi from '../services/alertApi.js';
import stockApi from '../services/stockApi.js';
import { formatCompact } from '../utils/format.js';

// The charting library is the heaviest dependency in the app and is only needed
// on this page, so it loads on demand rather than in the initial bundle.
const StockChart = lazy(() =>
  import('../components/StockChart.jsx').then((m) => ({ default: m.StockChart })),
);

const QUOTE_REFRESH_MS = 30_000;

// Charts and quotes can come from different providers, so the chart says whose
// data it is drawing.
const PROVIDER_LABEL = {
  twelvedata: 'Bars: Twelve Data · Quote: Finnhub',
  finnhub: 'Bars and quote: Finnhub',
};

function Facts({ stock }) {
  const rows = [
    ['Exchange', stock.exchange],
    ['Currency', stock.currency],
    ['Industry', stock.industry],
    ['Market cap', stock.marketCapitalization ? `${formatCompact(stock.marketCapitalization)}M` : null],
    ['Listed', stock.ipo],
  ].filter(([, value]) => value);

  if (rows.length === 0) return null;

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="label">{label}</dt>
          <dd className="mt-1 truncate text-sm text-paper">{value}</dd>
        </div>
      ))}
      {stock.website && (
        <div>
          <dt className="label">Website</dt>
          <dd className="mt-1 truncate text-sm">
            <a
              href={stock.website}
              target="_blank"
              rel="noreferrer noopener"
              className="text-muted underline decoration-ink-700 underline-offset-2 hover:text-signal"
            >
              {stock.website.replace(/^https?:\/\//, '')}
            </a>
          </dd>
        </div>
      )}
    </dl>
  );
}

export function StockDetail() {
  const { symbol: rawSymbol } = useParams();
  const symbol = (rawSymbol ?? '').toUpperCase();
  const [range, setRange] = useState('1d');
  const [isFavorite, setIsFavorite] = useState(null);

  const stock = useAsync(({ signal }) => stockApi.fetchStock(symbol, { signal }), [symbol]);

  const quote = useAsync(({ signal }) => stockApi.fetchQuote(symbol, { signal }), [symbol], {
    refreshMs: QUOTE_REFRESH_MS,
  });

  const candles = useAsync(
    ({ signal }) => stockApi.fetchCandles(symbol, range, { signal }),
    [symbol, range],
  );

  const rules = useAsync(({ signal }) => alertApi.fetchAlertRules({ symbol, signal }), [symbol]);

  const reloadRules = useCallback(() => rules.reload(), [rules]);

  if (stock.isLoading && !stock.data) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loading label={`Loading ${symbol}`} />
      </div>
    );
  }

  if (stock.error) {
    return (
      <div className="space-y-4">
        <Link to="/" className="text-sm text-muted hover:text-signal">
          ← Back to dashboard
        </Link>
        <ErrorState error={stock.error} onRetry={stock.reload} />
      </div>
    );
  }

  const detail = stock.data ?? {};
  const currency = detail.currency ?? 'USD';
  const liveQuote = quote.data ?? detail.quote;
  const favorited = isFavorite ?? detail.isFavorite ?? false;
  const priceBySymbol = { [symbol]: liveQuote?.price };

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-block text-sm text-muted transition hover:text-signal">
        ← Dashboard
      </Link>

      {/* Header: identity and price, the two things you came for. */}
      <header className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              {detail.logoUrl && (
                <img
                  src={detail.logoUrl}
                  alt=""
                  className="size-9 rounded border border-ink-800 bg-white/5 object-contain p-0.5"
                />
              )}
              <div className="min-w-0">
                <h1 className="tabular text-2xl font-semibold tracking-tight">{symbol}</h1>
                <p className="truncate text-sm text-muted">{detail.companyName ?? 'Unknown company'}</p>
              </div>
            </div>

            <div className="mt-5">
              <PriceDisplay quote={liveQuote} currency={currency} size="lg" />
            </div>
          </div>

          <FavoriteButton
            symbol={symbol}
            isFavorite={favorited}
            onChange={(next) => setIsFavorite(next)}
          />
        </div>

        {quote.error && !liveQuote && (
          <div className="mt-4">
            <ErrorState error={quote.error} onRetry={quote.reload} />
          </div>
        )}
      </header>

      {/* Chart with the user's thresholds drawn on it. */}
      <section className="panel p-4 sm:p-5" aria-labelledby="chart-heading">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="chart-heading" className="text-sm font-semibold">
            Price history
          </h2>
          <RangeSelector value={range} onChange={setRange} disabled={candles.isLoading} />
        </div>

        <Suspense
          fallback={
            <div className="flex h-[340px] items-center justify-center">
              <Loading label="Loading chart" />
            </div>
          }
        >
          <StockChart
            candles={candles.data}
            thresholds={rules.data ?? []}
            currency={currency}
            currentPrice={liveQuote?.price ?? null}
            isLoading={candles.isLoading}
            error={candles.error}
            onRetry={candles.reload}
          />
        </Suspense>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-faint">
          {(rules.data ?? []).length > 0 ? (
            <p className="flex items-center gap-2">
              <span aria-hidden="true" className="h-px w-6 bg-signal" />
              Dashed amber lines are your thresholds for {symbol}.
            </p>
          ) : (
            <span />
          )}
          {candles.data?.provider && (
            <p>
              {PROVIDER_LABEL[candles.data.provider] ?? candles.data.provider}
              {candles.data.cache?.hit && ` · cached ${candles.data.cache.ageSeconds}s ago`}
            </p>
          )}
        </div>
      </section>

      {/* Risk before action: what this thing does on an ordinary day, in money. */}
      <section className="panel p-5" aria-labelledby="risk-heading">
        <h2 id="risk-heading" className="mb-4 text-sm font-semibold">
          How much does {symbol} move?
        </h2>
        <RiskPanel symbol={symbol} range={range} currency={currency} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-5" aria-labelledby="practice-heading">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 id="practice-heading" className="text-sm font-semibold">
              Practise a trade
            </h2>
            <Link to="/practice" className="text-xs text-muted transition hover:text-signal">
              Your account
            </Link>
          </div>
          <TradeTicket symbol={symbol} currency={currency} />
        </section>

        <section className="panel p-5" aria-labelledby="alert-form-heading">
          <h2 id="alert-form-heading" className="mb-4 text-sm font-semibold">
            Set a threshold
          </h2>
          <AlertForm
            symbol={symbol}
            currentPrice={liveQuote?.price}
            currency={currency}
            onCreated={reloadRules}
          />
        </section>

        <section className="panel overflow-hidden" aria-labelledby="alert-list-heading">
          <div className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
            <h2 id="alert-list-heading" className="text-sm font-semibold">
              Alerts on {symbol}
            </h2>
            <span className="label">{rules.data?.length ?? 0} rules</span>
          </div>

          {rules.error ? (
            <ErrorState error={rules.error} onRetry={rules.reload} className="m-4" />
          ) : (
            <AlertList
              rules={rules.data}
              isLoading={rules.isLoading}
              priceBySymbol={priceBySymbol}
              currency={currency}
              onChanged={reloadRules}
              showSymbol={false}
              emptyTitle={`No thresholds on ${symbol}`}
              emptyDescription="Set one on the left and it will show up here and on the chart."
            />
          )}
        </section>
      </div>

      {Object.keys(detail).length > 0 && (
        <section className="panel p-5" aria-labelledby="facts-heading">
          <h2 id="facts-heading" className="mb-4 text-sm font-semibold">
            About {detail.companyName ?? symbol}
          </h2>
          <Facts stock={detail} />
        </section>
      )}
    </div>
  );
}

export default StockDetail;
