import { useState } from 'react';
import { Link } from 'react-router-dom';

import alertApi from '../services/alertApi.js';
import { formatDate, formatPrice, formatRelative } from '../utils/format.js';
import { EmptyState } from './EmptyState.jsx';
import { HelpTip } from './HelpTip.jsx';
import { SkeletonRows } from './Loading.jsx';
import { ThresholdGauge } from './ThresholdGauge.jsx';

function RuleRow({ rule, price, currency, onChanged, showSymbol }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const act = async (action) => {
    setPending(true);
    setError(null);
    try {
      await action();
      onChanged?.();
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };

  return (
    <li className="px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm">
            {showSymbol && (
              <Link
                to={`/stocks/${encodeURIComponent(rule.symbol)}`}
                className="tabular font-semibold text-paper hover:text-signal"
              >
                {rule.symbol}
              </Link>
            )}
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                rule.type === 'BUY' ? 'bg-up/15 text-up' : 'bg-down/15 text-down'
              }`}
            >
              {rule.type}
            </span>
            <span className="tabular text-muted">
              {rule.condition === 'BELOW' ? '≤' : '≥'} {formatPrice(rule.threshold, currency)}
            </span>
            {rule.trailPercent && (
              <span className="tabular inline-flex items-center gap-1.5 rounded bg-ink-800 px-1.5 py-0.5 text-[11px] text-signal">
                trailing {rule.trailPercent}%
                <HelpTip term="trailing" />
              </span>
            )}
            {!rule.enabled && <span className="label">paused</span>}
            {rule.suspendedAt && (
              <span className="rounded bg-signal/15 px-1.5 py-0.5 text-[11px] font-semibold text-signal">
                needs review
              </span>
            )}
          </p>

          <p className="mt-1 text-xs text-faint">
            {rule.triggered
              ? `Triggered ${formatRelative(rule.lastTriggeredAt)} — resets when the price crosses back`
              : rule.lastTriggeredAt
                ? `Last triggered ${formatRelative(rule.lastTriggeredAt)}`
                : 'Not triggered yet'}
            {rule.firedCount > 0 && ` · ${rule.firedCount} time${rule.firedCount === 1 ? '' : 's'}`}
          </p>

          {(rule.cooldownMinutes > 0 || rule.marketHoursOnly || rule.expiresAt || rule.referencePrice) && (
            <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-faint">
              {rule.referencePrice && (
                <span>
                  from {rule.condition === 'BELOW' ? 'high' : 'low'}{' '}
                  <span className="tabular">{formatPrice(rule.referencePrice, currency)}</span>
                </span>
              )}
              {rule.cooldownMinutes > 0 && <span>· at most every {rule.cooldownMinutes}m</span>}
              {rule.marketHoursOnly && <span>· regular hours only</span>}
              {rule.expiresAt && <span>· expires {formatDate(rule.expiresAt)}</span>}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => alertApi.updateAlertRule(rule.id, { enabled: !rule.enabled }))}
            className="rounded-md border border-ink-700 px-2.5 py-1 text-xs font-medium text-paper transition hover:border-signal hover:text-signal disabled:opacity-50"
          >
            {rule.enabled ? 'Pause' : 'Resume'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => alertApi.deleteAlertRule(rule.id))}
            className="rounded-md border border-ink-700 px-2.5 py-1 text-xs font-medium text-muted transition hover:border-down hover:text-down disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      {rule.suspendedAt && (
        <div className="mt-3 rounded-md border border-signal/40 bg-signal/5 p-3">
          <p className="text-xs text-paper">
            Paused after a {rule.suspendedReason ?? 'change in the price series'}. A split or similar
            event can leave this threshold meaning something you did not intend, so it stopped firing.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => act(() => alertApi.resumeAlertRule(rule.id))}
              className="rounded-md bg-signal px-2.5 py-1 text-xs font-semibold text-ink-950 transition hover:bg-signal/90 disabled:opacity-50"
            >
              Threshold is still right — resume
            </button>
            <span className="text-xs text-faint">or edit it on the stock page</span>
          </div>
        </div>
      )}

      <div className="mt-3 max-w-md">
        <ThresholdGauge
          price={price}
          threshold={rule.threshold}
          condition={rule.condition}
          enabled={rule.enabled && !rule.suspendedAt}
          currency={currency}
        />
      </div>

      {error && (
        <p className="mt-2 text-xs text-down" role="alert">
          {error.message}
        </p>
      )}
    </li>
  );
}

/** Active threshold rules, each with its distance-to-threshold gauge. */
export function AlertList({
  rules,
  isLoading,
  priceBySymbol = {},
  currency = 'USD',
  onChanged,
  showSymbol = true,
  emptyTitle = 'No alerts yet',
  emptyDescription = 'Create a threshold above and it will appear here.',
}) {
  if (isLoading && !rules) return <SkeletonRows rows={3} />;

  if (!rules || rules.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <ul className="divide-y divide-ink-850">
      {rules.map((rule) => (
        <RuleRow
          key={rule.id}
          rule={rule}
          price={priceBySymbol[rule.symbol]}
          currency={currency}
          onChanged={onChanged}
          showSymbol={showSymbol}
        />
      ))}
    </ul>
  );
}

export default AlertList;
