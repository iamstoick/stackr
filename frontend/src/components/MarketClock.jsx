import useAsync from '../hooks/useAsync.js';
import learnApi from '../services/learnApi.js';
import { HelpTip } from './HelpTip.jsx';

function countdown(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/**
 * Whether the market is open, and when it next changes.
 *
 * Beginners routinely do not know the market is shut, then wonder why a price
 * has not moved for hours. Saying it plainly removes a whole class of confusion.
 */
export function MarketClock({ className = '' }) {
  const { data: clock } = useAsync(({ signal }) => learnApi.fetchMarketClock({ signal }), [], {
    refreshMs: 60_000,
  });

  if (!clock) return null;

  const open = clock.session === 'open';
  const until = open ? countdown(clock.nextClose?.msUntil) : countdown(clock.nextOpen?.msUntil);

  const label = (() => {
    if (open) return until ? `Market closes in ${until}` : 'Market open';
    if (clock.session === 'pre') return until ? `Opens in ${until}` : 'Pre-market';
    if (clock.session === 'post') return until ? `Reopens in ${until}` : 'After hours';
    if (clock.holiday) return `Closed — ${clock.holiday}`;
    return until ? `Closed · opens in ${until}` : 'Market closed';
  })();

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${open ? 'text-up' : 'text-muted'} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${open ? 'bg-up' : 'bg-faint'}`}
      />
      <span className="tabular">{label}</span>
      <HelpTip term="marketSession" />
    </span>
  );
}

export default MarketClock;
