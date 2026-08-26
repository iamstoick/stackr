import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { directionOf, formatPercent, formatPrice, formatRelative } from '../utils/format.js';
import { EmptyState } from './EmptyState.jsx';
import { HelpTip } from './HelpTip.jsx';
import { SkeletonRows } from './Loading.jsx';

const TONE = { up: 'text-up', down: 'text-down', flat: 'text-muted' };

const COLUMNS = [
  { key: 'symbol', label: 'Symbol', align: 'left', term: 'symbol' },
  { key: 'company', label: 'Company', align: 'left', term: 'company', hideOnMobile: true },
  { key: 'price', label: 'Price', align: 'right', term: 'price' },
  { key: 'change', label: 'Today', align: 'right', term: 'changeToday' },
  { key: 'range', label: 'Day range', align: 'right', term: 'dayRange', hideOnMobile: true },
];

const valueFor = (favorite, key) => {
  switch (key) {
    case 'symbol':
      return favorite.stock.symbol;
    case 'company':
      return favorite.stock.companyName ?? '';
    case 'price':
      return favorite.quote?.price ?? -Infinity;
    case 'change':
      return favorite.quote?.changePercent ?? -Infinity;
    case 'range':
      return favorite.quote?.rangePosition ?? -Infinity;
    default:
      return 0;
  }
};

/**
 * Where the last trade sits inside the session's range. Closing on the low is a
 * different story from closing on the high even when the percentage is the same.
 */
function DayRange({ quote }) {
  const position = quote?.rangePosition;
  if (position === null || position === undefined) return <span className="text-faint">—</span>;

  return (
    <span className="inline-flex items-center gap-2" title={`Low ${quote.low} · High ${quote.high}`}>
      <span className="relative block h-1 w-16 rounded-full bg-ink-800">
        <span
          className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-paper"
          style={{ left: `${Math.min(100, Math.max(0, position * 100))}%` }}
        />
      </span>
      <span className="tabular text-xs text-faint">{Math.round(position * 100)}%</span>
    </span>
  );
}

function Row({ favorite }) {
  const { stock, quote } = favorite;
  const direction = directionOf(quote?.changePercent);

  return (
    <li>
      <Link
        to={`/stocks/${encodeURIComponent(stock.symbol)}`}
        className="grid grid-cols-[6rem_1fr_6rem] items-center gap-3 px-4 py-3 transition hover:bg-ink-850 sm:grid-cols-[6rem_1fr_7rem_6rem_8rem]"
      >
        <span className="flex items-center gap-1.5">
          <span className="tabular text-sm font-semibold text-paper">{stock.symbol}</span>
          {favorite.alertCount > 0 && (
            <span
              title={`${favorite.alertCount} armed threshold${favorite.alertCount === 1 ? '' : 's'}`}
              aria-label={`${favorite.alertCount} armed thresholds`}
              className="tabular rounded bg-signal/15 px-1 text-[10px] font-semibold text-signal"
            >
              {favorite.alertCount}
            </span>
          )}
        </span>

        <span className="hidden truncate text-sm text-muted sm:block">
          {stock.companyName ?? '—'}
        </span>

        <span className="tabular text-right text-sm text-paper">
          {formatPrice(quote?.price, stock.currency ?? 'USD')}
        </span>

        <span className={`tabular text-right text-sm ${TONE[direction]}`}>
          {formatPercent(quote?.changePercent)}
        </span>

        <span className="hidden justify-end sm:flex">
          <DayRange quote={quote} />
        </span>
      </Link>
    </li>
  );
}

/** The dashboard's ledger: one row per followed symbol. */
export function Watchlist({ favorites, isLoading, updatedAt }) {
  const [sort, setSort] = useState({ key: 'symbol', direction: 'asc' });

  const sorted = useMemo(() => {
    if (!favorites) return favorites;
    const rows = [...favorites];
    rows.sort((a, b) => {
      const left = valueFor(a, sort.key);
      const right = valueFor(b, sort.key);
      const comparison =
        typeof left === 'string' ? left.localeCompare(right) : Number(left) - Number(right);
      return sort.direction === 'asc' ? comparison : -comparison;
    });
    return rows;
  }, [favorites, sort]);

  const toggleSort = (key) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'symbol' || key === 'company' ? 'asc' : 'desc' },
    );

  if (isLoading && !favorites) return <SkeletonRows rows={5} />;

  if (!favorites || favorites.length === 0) {
    return (
      <EmptyState
        title="Your watchlist is empty"
        description="Search for a symbol above, open it, and add it to your watchlist to track its price here."
      />
    );
  }

  return (
    <div>
      <div className="grid grid-cols-[6rem_1fr_6rem] gap-3 border-b border-ink-800 px-4 pb-2 sm:grid-cols-[6rem_1fr_7rem_6rem_8rem]">
        {COLUMNS.map((column) => (
          <span
            key={column.key}
            className={`flex items-center gap-1.5 ${
              column.align === 'right' ? 'justify-end' : 'justify-start'
            } ${column.hideOnMobile ? 'hidden sm:flex' : ''}`}
          >
            <button
              type="button"
              onClick={() => toggleSort(column.key)}
              aria-sort={
                sort.key === column.key
                  ? sort.direction === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              }
              className={`label transition hover:text-muted ${
                sort.key === column.key ? 'text-signal' : ''
              }`}
            >
              {column.label}
              {sort.key === column.key && (sort.direction === 'asc' ? ' ↑' : ' ↓')}
            </button>
            <HelpTip term={column.term} />
          </span>
        ))}
      </div>

      <ul className="divide-y divide-ink-850">
        {sorted.map((favorite) => (
          <Row key={favorite.stock.symbol} favorite={favorite} />
        ))}
      </ul>

      {updatedAt && (
        <p className="border-t border-ink-800 px-4 py-2.5 text-xs text-faint">
          Prices refreshed {formatRelative(updatedAt)} · the server polls every 5 minutes
        </p>
      )}
    </div>
  );
}

export default Watchlist;
