import { Link } from 'react-router-dom';

import { AlertHistory } from '../components/AlertHistory.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { GettingStarted } from '../components/GettingStarted.jsx';
import { StockSearch } from '../components/StockSearch.jsx';
import { Watchlist } from '../components/Watchlist.jsx';
import useAsync from '../hooks/useAsync.js';
import useAuth from '../hooks/useAuth.js';
import alertApi from '../services/alertApi.js';
import favoriteApi from '../services/favoriteApi.js';
import learnApi from '../services/learnApi.js';
import { directionOf, formatPercent } from '../utils/format.js';

const REFRESH_MS = 30_000;

function Movers({ favorites }) {
  const ranked = (favorites ?? [])
    .filter((f) => typeof f.quote?.changePercent === 'number')
    .sort((a, b) => Math.abs(b.quote.changePercent) - Math.abs(a.quote.changePercent))
    .slice(0, 3);

  if (ranked.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {ranked.map(({ stock, quote }) => {
        const direction = directionOf(quote.changePercent);
        return (
          <Link
            key={stock.symbol}
            to={`/stocks/${encodeURIComponent(stock.symbol)}`}
            className="tabular flex items-center gap-2 rounded-md border border-ink-800 px-2.5 py-1 text-xs transition hover:border-ink-700"
          >
            <span className="font-semibold text-paper">{stock.symbol}</span>
            <span className={direction === 'up' ? 'text-up' : direction === 'down' ? 'text-down' : 'text-muted'}>
              {formatPercent(quote.changePercent)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function Dashboard() {
  const { user } = useAuth();

  const favorites = useAsync(({ signal }) => favoriteApi.fetchFavorites({ signal }), [], {
    refreshMs: REFRESH_MS,
  });

  const history = useAsync(
    ({ signal }) => alertApi.fetchAlertHistory({ limit: 8, signal }),
    [],
    { refreshMs: REFRESH_MS },
  );

  const onboarding = useAsync(({ signal }) => learnApi.fetchProgress({ signal }), []);

  const firstName = user?.name?.split(' ')[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Dashboard</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">
            {firstName ? `${firstName}'s desk` : 'Your desk'}
          </h1>
        </div>
        <Movers favorites={favorites.data} />
      </div>

      <GettingStarted onboarding={onboarding.data} onChange={onboarding.setData} />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="panel overflow-hidden" aria-labelledby="watchlist-heading">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 px-4 py-3">
            <h2 id="watchlist-heading" className="text-sm font-semibold">
              Watchlist
            </h2>
            <span className="label">{favorites.data?.length ?? 0} symbols</span>
          </div>

          {favorites.error ? (
            <ErrorState error={favorites.error} onRetry={favorites.reload} className="m-4" />
          ) : (
            <Watchlist
              favorites={favorites.data}
              isLoading={favorites.isLoading}
              updatedAt={favorites.data?.[0]?.quote?.updatedAt}
            />
          )}
        </section>

        <div className="space-y-6">
          <section className="panel p-4" aria-labelledby="search-heading">
            <h2 id="search-heading" className="mb-3 text-sm font-semibold">
              Find a stock
            </h2>
            <StockSearch placeholder="AAPL, MSFT, NVDA…" />
            <p className="mt-2.5 text-xs text-faint">
              Open a stock to chart it, follow it, or set a threshold.
            </p>
          </section>

          <section className="panel overflow-hidden" aria-labelledby="alerts-heading">
            <div className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
              <h2 id="alerts-heading" className="text-sm font-semibold">
                Recent alerts
              </h2>
              <Link to="/alerts" className="text-xs font-medium text-muted hover:text-signal">
                All alerts
              </Link>
            </div>

            {history.error ? (
              <ErrorState error={history.error} onRetry={history.reload} className="m-4" />
            ) : (
              <AlertHistory
                alerts={history.data?.items}
                isLoading={history.isLoading}
                onAcknowledged={history.reload}
                compact
              />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
