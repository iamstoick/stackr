import { ErrorState } from '../components/ErrorState.jsx';
import { StockSearch } from '../components/StockSearch.jsx';
import { Watchlist } from '../components/Watchlist.jsx';
import useAsync from '../hooks/useAsync.js';
import favoriteApi from '../services/favoriteApi.js';

export function WatchlistPage() {
  const favorites = useAsync(({ signal }) => favoriteApi.fetchFavorites({ signal }), [], {
    refreshMs: 30_000,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Watchlist</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">Everything you follow</h1>
        </div>
        <div className="w-full sm:w-80">
          <StockSearch placeholder="Add a symbol" />
        </div>
      </div>

      {favorites.error ? (
        <ErrorState error={favorites.error} onRetry={favorites.reload} />
      ) : (
        <section className="panel overflow-hidden">
          <Watchlist
            favorites={favorites.data}
            isLoading={favorites.isLoading}
            updatedAt={favorites.data?.[0]?.quote?.updatedAt}
          />
        </section>
      )}
    </div>
  );
}

export default WatchlistPage;
