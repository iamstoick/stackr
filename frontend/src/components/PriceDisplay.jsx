import { useEffect, useRef, useState } from 'react';

import {
  MARKET_SESSION_LABEL,
  describeQuoteSource,
  directionOf,
  formatChange,
  formatPercent,
  formatPrice,
} from '../utils/format.js';
import { HelpTip } from './HelpTip.jsx';

const TONE = {
  up: 'text-up',
  down: 'text-down',
  flat: 'text-muted',
};

/**
 * The price readout. Sizes are driven by `size` so the same component serves
 * the stock header and the compact table cell.
 */
export function PriceDisplay({ quote, currency = 'USD', size = 'md', showMeta = true }) {
  const direction = directionOf(quote?.change);
  const [flash, setFlash] = useState(null);
  const previous = useRef(quote?.price);

  // Brief tint when a poll changes the price: the only motion on this surface.
  useEffect(() => {
    if (previous.current !== undefined && quote?.price !== undefined && quote.price !== previous.current) {
      setFlash(quote.price > previous.current ? 'up' : 'down');
      const timer = setTimeout(() => setFlash(null), 900);
      previous.current = quote.price;
      return () => clearTimeout(timer);
    }
    previous.current = quote?.price;
    return undefined;
  }, [quote?.price]);

  const priceClass = size === 'lg' ? 'text-4xl sm:text-5xl' : size === 'sm' ? 'text-base' : 'text-2xl';

  return (
    <div className={flash === 'up' ? 'flash-up rounded-md' : flash === 'down' ? 'flash-down rounded-md' : ''}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`tabular font-medium tracking-tight ${priceClass}`}>
          {formatPrice(quote?.price, currency)}
        </span>
        {size === 'lg' && <HelpTip term="price" className="self-center" />}

        <span className={`tabular text-sm font-medium ${TONE[direction]}`}>
          {formatChange(quote?.change, currency)}
          <span className="ml-2 rounded bg-ink-850 px-1.5 py-0.5 text-xs">
            {formatPercent(quote?.changePercent)}
          </span>
        </span>
        {size === 'lg' && <HelpTip term="changeAmount" className="self-center" />}
      </div>

      {showMeta && quote?.data && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`size-1.5 rounded-full ${quote.data.live ? 'bg-up' : 'bg-faint'}`}
            />
            {quote.data.sessionLabel ??
              MARKET_SESSION_LABEL[quote.data.marketSession] ??
              'Market status unknown'}
          </span>
          <HelpTip term="marketSession" />

          {quote.data.exchangeTime && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular">{quote.data.exchangeTime} ET</span>
            </>
          )}

          <span aria-hidden="true">·</span>
          <span>{describeQuoteSource(quote.data)}</span>

          {quote.data.earlyClose && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-signal">Half day ({quote.data.earlyClose})</span>
            </>
          )}

          {quote.data.stale && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5 rounded border border-signal/40 px-1.5 py-0.5 text-signal">
                Delayed
                <HelpTip term="delayed" />
              </span>
            </>
          )}
        </p>
      )}
    </div>
  );
}

export default PriceDisplay;
