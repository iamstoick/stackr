import { useState } from 'react';

import useAsync from '../hooks/useAsync.js';
import paperApi from '../services/paperApi.js';
import { formatDate, formatPercent, formatPrice } from '../utils/format.js';
import { HelpTip } from './HelpTip.jsx';
import { SkeletonRows } from './Loading.jsx';

const BAND_COPY = {
  steady: {
    label: 'Steady',
    tone: 'text-up',
    text: 'moves less than 1% on a typical day, which is calm for a single stock',
  },
  normal: {
    label: 'Normal',
    tone: 'text-paper',
    text: 'moves 1–2% on a typical day, which is ordinary for a large company',
  },
  lively: {
    label: 'Lively',
    tone: 'text-signal',
    text: 'moves 2–4% on a typical day — expect green and red days that feel dramatic',
  },
  wild: {
    label: 'Wild',
    tone: 'text-down',
    text: 'moves more than 4% on a typical day, so a normal day here looks like a crisis elsewhere',
  },
};

const SIZES = [500, 1000, 5000, 10000];

/**
 * Volatility translated into money.
 *
 * "Annualised standard deviation of 32%" means nothing to a beginner.
 * "$1,000 in this would swing about $23 on an average day, and would have been
 * down $310 at the worst point in this window" means quite a lot. Same data.
 */
export function RiskPanel({ symbol, range = '1d', currency = 'USD' }) {
  const [positionValue, setPositionValue] = useState(1000);

  const { data, isLoading } = useAsync(
    ({ signal }) => paperApi.fetchRisk(symbol, { range, positionValue, signal }),
    [symbol, range, positionValue],
  );

  if (isLoading && !data) return <SkeletonRows rows={3} />;

  const risk = data?.risk;
  if (!risk) {
    return (
      <p className="text-sm text-muted">
        Not enough price history in this timeframe to measure how much {symbol} moves.
      </p>
    );
  }

  const band = BAND_COPY[risk.band] ?? BAND_COPY.normal;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        <span className={`font-medium ${band.tone}`}>{band.label}.</span> Over this window {symbol}{' '}
        {band.text}.
      </p>

      <div>
        <label htmlFor="risk-size" className="label mb-2 block">
          If I put in…
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setPositionValue(size)}
              aria-pressed={positionValue === size}
              className={`tabular rounded-md border px-2.5 py-1 text-xs transition ${
                positionValue === size
                  ? 'border-signal/50 bg-signal/10 text-signal'
                  : 'border-ink-800 text-muted hover:border-ink-700 hover:text-paper'
              }`}
            >
              {formatPrice(size, currency).replace(/\.00$/, '')}
            </button>
          ))}
          <input
            id="risk-size"
            type="number"
            min="1"
            step="100"
            value={positionValue}
            onChange={(event) => setPositionValue(Math.max(1, Number(event.target.value) || 1))}
            aria-label="Custom position size"
            className="tabular w-24 rounded-md border border-ink-800 bg-ink-950 px-2 py-1 text-xs text-paper focus:border-signal/60 focus:outline-none"
          />
        </div>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <Metric
          label="Typical daily swing"
          value={formatPrice(risk.typicalDailySwing, currency)}
          detail={`${formatPercent(risk.typicalMovePercent)} of your position, on an average day`}
          help={{
            title: 'Typical daily swing',
            body: 'The average size of a one-day move, up or down, over this window — in dollars on the amount you chose. If this number would keep you awake, the position is too big.',
          }}
        />

        <Metric
          label="Worst single day"
          value={formatPrice(risk.worstBarLoss, currency)}
          detail={`${formatPercent(risk.worstBarPercent)} in one session`}
          tone="text-down"
          help={{
            title: 'Worst single day',
            body: 'The largest one-day fall in this window, applied to your amount. It has already happened once, so it is not a worst case — just a recent one.',
          }}
        />

        {risk.maxDrawdown && (
          <Metric
            label="Worst drop from a high"
            value={formatPrice(risk.drawdownLoss, currency)}
            detail={`${formatPercent(risk.maxDrawdown.percent)} over ${risk.maxDrawdown.days} day${
              risk.maxDrawdown.days === 1 ? '' : 's'
            }, ${formatDate(risk.maxDrawdown.peakAt)} → ${formatDate(risk.maxDrawdown.troughAt)}`}
            tone="text-down"
            help={{
              title: 'Drawdown',
              body: 'What you would have been down if you had bought at the worst possible moment in this window and held through the low. This is the number that tests whether you can actually hold something.',
            }}
          />
        )}

        {risk.annualizedVolatilityPercent !== null && (
          <Metric
            label="Volatility (annualised)"
            value={formatPercent(risk.annualizedVolatilityPercent)}
            detail="the standard measure, for comparing one stock against another"
            help={{
              title: 'Annualised volatility',
              body: 'Daily variation scaled to a year, so different stocks can be compared on one number. Roughly: under 20% is calm, over 50% is speculative.',
            }}
          />
        )}
      </dl>

      <p className="border-t border-ink-800 pt-3 text-xs text-faint">
        {data.basis}
      </p>
    </div>
  );
}

function Metric({ label, value, detail, tone = 'text-paper', help }) {
  return (
    <div>
      <dt className="label flex items-center gap-1.5">
        {label}
        {help && <HelpTip title={help.title} body={help.body} />}
      </dt>
      <dd className={`tabular mt-1 text-xl font-medium ${tone}`}>{value}</dd>
      <dd className="mt-0.5 text-xs text-faint">{detail}</dd>
    </div>
  );
}

export default RiskPanel;
