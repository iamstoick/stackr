import { formatPercent, formatPrice } from '../utils/format.js';
import { HelpTip } from './HelpTip.jsx';

/**
 * The distance-to-threshold track — the one thing this app is really about.
 *
 * The amber tick is the threshold, the dot is the current price, and the filled
 * span between them is how much room is left. The side the dot sits on tells you
 * whether the rule is currently satisfied without reading any numbers.
 */
export function ThresholdGauge({ price, threshold, condition, enabled = true, currency = 'USD' }) {
  const current = Number(price);
  const line = Number(threshold);
  const known = Number.isFinite(current) && Number.isFinite(line) && line > 0;

  if (!known) {
    return (
      <div className="flex items-center gap-2 text-xs text-faint">
        <span className="h-1 w-full max-w-40 rounded-full bg-ink-800" />
        <span>waiting for price</span>
      </div>
    );
  }

  const gapRatio = (current - line) / line;
  // The track shows ±10% around the threshold; anything further pins to an end.
  const clamped = Math.max(-0.1, Math.min(0.1, gapRatio));
  const dotPercent = 50 + (clamped / 0.1) * 45;

  const met = condition === 'BELOW' ? current <= line : current >= line;
  const tone = met ? 'bg-signal' : 'bg-muted';

  return (
    <div className="w-full">
      <div className="relative h-5" aria-hidden="true">
        {/* track */}
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink-700" />
        {/* threshold tick */}
        <span
          className={`absolute top-1/2 left-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 ${
            enabled ? 'bg-signal' : 'bg-faint'
          }`}
        />
        {/* span between price and threshold */}
        <span
          className={`absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full ${tone} opacity-70`}
          style={{
            left: `${Math.min(50, dotPercent)}%`,
            width: `${Math.abs(dotPercent - 50)}%`,
          }}
        />
        {/* current price */}
        <span
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-950 bg-paper"
          style={{ left: `${dotPercent}%` }}
        />
      </div>

      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
        <span className="tabular">
          <span className={met ? 'text-signal' : 'text-muted'}>
            {met ? 'Condition met' : `${formatPercent(gapRatio * 100)} from`}
          </span>{' '}
          {condition === 'BELOW' ? '≤' : '≥'} {formatPrice(line, currency)}
        </span>
        <HelpTip term="thresholdGauge" />
      </p>
    </div>
  );
}

export default ThresholdGauge;
