import { HelpTip } from './HelpTip.jsx';

export const RANGES = [
  { key: '1m', label: '1m', description: 'Minute bars, last day' },
  { key: '1h', label: '1h', description: 'Hourly bars, last week' },
  { key: '1d', label: '1D', description: 'Daily bars, last quarter' },
  { key: '1w', label: '1W', description: 'Weekly bars, last year' },
  { key: '1mo', label: '1M', description: 'Monthly bars, last 5 years' },
  { key: '1y', label: '1Y', description: 'Monthly bars, last 20 years' },
];

/** Segmented control over the chart timeframes the API supports. */
export function RangeSelector({ value, onChange, disabled = false }) {
  return (
    <div className="flex items-center gap-2">
      <div
        role="tablist"
        aria-label="Chart timeframe"
        className="inline-flex items-center gap-0.5 rounded-md border border-ink-800 bg-ink-950 p-0.5"
      >
        {RANGES.map((range) => {
          const active = range.key === value;
          return (
            <button
              key={range.key}
              type="button"
              role="tab"
              aria-selected={active}
              title={range.description}
              disabled={disabled}
              onClick={() => onChange(range.key)}
              className={`tabular rounded px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
                active ? 'bg-ink-800 text-signal' : 'text-muted hover:text-paper'
              }`}
            >
              {range.label}
            </button>
          );
        })}
      </div>
      <HelpTip term="timeframe" />
    </div>
  );
}

export default RangeSelector;
