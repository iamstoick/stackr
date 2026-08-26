import { useState } from 'react';
import { Link } from 'react-router-dom';

import alertApi from '../services/alertApi.js';
import { formatDateTime, formatPrice, formatRelative } from '../utils/format.js';
import { EmptyState } from './EmptyState.jsx';
import { SkeletonRows } from './Loading.jsx';

const TRIGGER_PHRASE = {
  INTERVAL_LOW: 'traded down through',
  INTERVAL_HIGH: 'traded up through',
};

function HistoryRow({ alert, onAcknowledged, compact }) {
  const [pending, setPending] = useState(false);
  const unread = !alert.acknowledgedAt;
  const isSystem = alert.kind === 'SYSTEM';

  const acknowledge = async () => {
    setPending(true);
    try {
      await alertApi.acknowledgeAlert(alert.id);
      onAcknowledged?.(alert.id);
    } finally {
      setPending(false);
    }
  };

  return (
    <li className={`flex gap-3 px-4 py-3 ${unread ? 'bg-signal/[0.04]' : ''}`}>
      <span
        aria-hidden="true"
        className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
          isSystem ? 'bg-signal' : unread ? 'bg-signal' : 'bg-ink-700'
        }`}
      />

      <div className="min-w-0 flex-1">
        {isSystem ? (
          <>
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <Link
                to={`/stocks/${encodeURIComponent(alert.symbol)}`}
                className="tabular font-semibold text-paper hover:text-signal"
              >
                {alert.symbol}
              </Link>
              <span className="label">alerts paused</span>
            </p>
            <p className="mt-0.5 text-xs text-muted">{alert.message}</p>
          </>
        ) : (
          <>
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <Link
                to={`/stocks/${encodeURIComponent(alert.symbol)}`}
                className="tabular font-semibold text-paper hover:text-signal"
              >
                {alert.symbol}
              </Link>
              <span className="text-muted">
                {TRIGGER_PHRASE[alert.triggerKind] ??
                  (alert.type === 'BUY' ? 'dropped to' : 'rose to')}{' '}
                <span className="tabular text-paper">{formatPrice(alert.triggerPrice)}</span>
              </span>
            </p>

            <p className="mt-0.5 text-xs text-faint">
              {compact ? formatRelative(alert.triggeredAt) : formatDateTime(alert.triggeredAt)} ·
              threshold <span className="tabular">{formatPrice(alert.threshold)}</span>
              {alert.triggerKind && alert.triggerKind !== 'LAST' && ' · caught between polls'}
            </p>
          </>
        )}
      </div>

      {unread && (
        <button
          type="button"
          onClick={acknowledge}
          disabled={pending}
          className="self-start rounded border border-ink-700 px-2 py-0.5 text-xs text-muted transition hover:border-signal hover:text-signal disabled:opacity-50"
        >
          Mark read
        </button>
      )}
    </li>
  );
}

/** Triggered alerts, newest first. */
export function AlertHistory({ alerts, isLoading, onAcknowledged, compact = false }) {
  if (isLoading && !alerts) return <SkeletonRows rows={3} />;

  if (!alerts || alerts.length === 0) {
    return (
      <EmptyState
        title="Nothing has triggered yet"
        description="When a price crosses one of your thresholds, the alert lands here."
      />
    );
  }

  return (
    <ul className="divide-y divide-ink-850">
      {alerts.map((alert) => (
        <HistoryRow
          key={alert.id}
          alert={alert}
          onAcknowledged={onAcknowledged}
          compact={compact}
        />
      ))}
    </ul>
  );
}

export default AlertHistory;
