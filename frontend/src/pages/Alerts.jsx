import { useMemo, useState } from 'react';

import { AlertHistory } from '../components/AlertHistory.jsx';
import { AlertList } from '../components/AlertList.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import useAsync from '../hooks/useAsync.js';
import alertApi from '../services/alertApi.js';
import favoriteApi from '../services/favoriteApi.js';

const TABS = [
  { key: 'rules', label: 'Thresholds' },
  { key: 'history', label: 'Triggered' },
];

export function Alerts() {
  const [tab, setTab] = useState('rules');
  const [unacknowledgedOnly, setUnacknowledgedOnly] = useState(false);

  const rules = useAsync(({ signal }) => alertApi.fetchAlertRules({ signal }), []);
  const favorites = useAsync(({ signal }) => favoriteApi.fetchFavorites({ signal }), [], {
    refreshMs: 60_000,
  });
  const history = useAsync(
    ({ signal }) => alertApi.fetchAlertHistory({ limit: 50, unacknowledged: unacknowledgedOnly, signal }),
    [unacknowledgedOnly],
  );

  // The gauge on each rule needs a price; the watchlist already carries one.
  const priceBySymbol = useMemo(() => {
    const map = {};
    for (const favorite of favorites.data ?? []) {
      if (favorite.quote?.price != null) map[favorite.stock.symbol] = favorite.quote.price;
    }
    return map;
  }, [favorites.data]);

  const activeCount = (rules.data ?? []).filter((r) => r.enabled).length;

  return (
    <div className="space-y-6">
      <div>
        <p className="label">Alerts</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">Thresholds and what crossed them</h1>
        <p className="mt-2 text-sm text-muted">
          {activeCount} active {activeCount === 1 ? 'threshold' : 'thresholds'}. The server checks
          every 5 minutes and fires once per crossing, then re-arms when the price moves back.
        </p>
      </div>

      <div role="tablist" aria-label="Alert views" className="flex gap-1 border-b border-ink-800">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === item.key
                ? 'border-signal text-paper'
                : 'border-transparent text-muted hover:text-paper'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'rules' &&
        (rules.error ? (
          <ErrorState error={rules.error} onRetry={rules.reload} />
        ) : (
          <section className="panel overflow-hidden">
            <AlertList
              rules={rules.data}
              isLoading={rules.isLoading}
              priceBySymbol={priceBySymbol}
              onChanged={rules.reload}
              emptyTitle="No thresholds yet"
              emptyDescription="Open a stock and set a buy or sell threshold to start monitoring it."
            />
          </section>
        ))}

      {tab === 'history' && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={unacknowledgedOnly}
              onChange={(event) => setUnacknowledgedOnly(event.target.checked)}
              className="size-3.5 accent-[var(--color-signal)]"
            />
            Unread only
          </label>

          {history.error ? (
            <ErrorState error={history.error} onRetry={history.reload} />
          ) : (
            <section className="panel overflow-hidden">
              <AlertHistory
                alerts={history.data?.items}
                isLoading={history.isLoading}
                onAcknowledged={history.reload}
              />
              {history.data?.total > (history.data?.items?.length ?? 0) && (
                <p className="border-t border-ink-800 px-4 py-2.5 text-xs text-faint">
                  Showing {history.data.items.length} of {history.data.total} alerts.
                </p>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default Alerts;
