import { useEffect, useState } from 'react';

import alertApi from '../services/alertApi.js';
import { formatPrice } from '../utils/format.js';

const TYPES = [
  { value: 'BUY', label: 'Buy', hint: 'Tell me when it gets cheap enough' },
  { value: 'SELL', label: 'Sell', hint: 'Tell me when it gets high enough' },
];

const MODES = [
  { value: 'fixed', label: 'Fixed price', hint: 'A level that does not move' },
  { value: 'trailing', label: 'Trailing %', hint: 'Follows the price as it runs' },
];

const COOLDOWNS = [
  { value: 0, label: 'Every crossing' },
  { value: 30, label: 'At most every 30m' },
  { value: 60, label: 'At most hourly' },
  { value: 1440, label: 'At most daily' },
];

/**
 * Creates a threshold rule for one symbol.
 *
 * BUY defaults to BELOW and SELL to ABOVE because that is what people mean, but
 * either pairing is allowed. A trailing rule measures its distance from the best
 * price seen after it is armed, which is what a stop-loss actually is.
 */
export function AlertForm({ symbol, currentPrice, currency = 'USD', onCreated }) {
  const [type, setType] = useState('BUY');
  const [mode, setMode] = useState('fixed');
  const [condition, setCondition] = useState('BELOW');
  const [threshold, setThreshold] = useState('');
  const [trailPercent, setTrailPercent] = useState('8');
  const [cooldownMinutes, setCooldownMinutes] = useState(0);
  const [marketHoursOnly, setMarketHoursOnly] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [confirmation, setConfirmation] = useState(null);

  // Seed the field with a sensible starting point near the current price.
  useEffect(() => {
    if (threshold === '' && typeof currentPrice === 'number') {
      const suggested = condition === 'BELOW' ? currentPrice * 0.95 : currentPrice * 1.05;
      setThreshold(suggested.toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice]);

  const chooseType = (nextType) => {
    setType(nextType);
    setCondition(nextType === 'BUY' ? 'BELOW' : 'ABOVE');
  };

  const trailingLevel =
    typeof currentPrice === 'number' && trailPercent
      ? condition === 'BELOW'
        ? currentPrice * (1 - Number(trailPercent) / 100)
        : currentPrice * (1 + Number(trailPercent) / 100)
      : null;

  const submit = async (event) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setConfirmation(null);

    try {
      const rule = await alertApi.createAlertRule({
        symbol,
        type,
        condition,
        // A trailing rule still needs a starting threshold for the first poll,
        // before its reference price is established.
        threshold: mode === 'trailing' ? (trailingLevel ?? Number(threshold)) : Number(threshold),
        ...(mode === 'trailing' ? { trailPercent: Number(trailPercent) } : {}),
        ...(cooldownMinutes ? { cooldownMinutes } : {}),
        ...(marketHoursOnly ? { marketHoursOnly } : {}),
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      });

      setConfirmation(
        rule.trailPercent
          ? `Trailing ${rule.trailPercent}% behind ${rule.symbol}, currently ${formatPrice(rule.threshold, currency)}.`
          : `Watching ${rule.symbol} for ${rule.condition === 'BELOW' ? 'a drop to' : 'a rise to'} ${formatPrice(rule.threshold, currency)}.`,
      );
      onCreated?.(rule);
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };

  const invalid =
    mode === 'fixed'
      ? threshold === '' || Number(threshold) <= 0
      : trailPercent === '' || Number(trailPercent) <= 0 || Number(trailPercent) >= 100;

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset>
        <legend className="label mb-2">Alert me to</legend>
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => chooseType(option.value)}
              aria-pressed={type === option.value}
              className={`rounded-md border px-3 py-2 text-left transition ${
                type === option.value
                  ? 'border-signal/50 bg-signal/10'
                  : 'border-ink-800 hover:border-ink-700'
              }`}
            >
              <span className="block text-sm font-medium text-paper">{option.label}</span>
              <span className="block text-xs text-faint">{option.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="label mb-2">Level</legend>
        <div className="grid grid-cols-2 gap-2">
          {MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              aria-pressed={mode === option.value}
              className={`rounded-md border px-3 py-2 text-left transition ${
                mode === option.value
                  ? 'border-signal/50 bg-signal/10'
                  : 'border-ink-800 hover:border-ink-700'
              }`}
            >
              <span className="block text-sm font-medium text-paper">{option.label}</span>
              <span className="block text-xs text-faint">{option.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {mode === 'fixed' ? (
        <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
          <div>
            <label htmlFor="alert-condition" className="label mb-2 block">
              When price is
            </label>
            <select
              id="alert-condition"
              value={condition}
              onChange={(event) => setCondition(event.target.value)}
              className="w-full rounded-md border border-ink-800 bg-ink-950 px-3 py-2 text-sm text-paper"
            >
              <option value="BELOW">at or below</option>
              <option value="ABOVE">at or above</option>
            </select>
          </div>

          <div>
            <label htmlFor="alert-threshold" className="label mb-2 block">
              Threshold
            </label>
            <div className="flex items-center gap-2 rounded-md border border-ink-800 bg-ink-950 px-3 py-2 focus-within:border-signal/60">
              <span className="text-sm text-faint">$</span>
              <input
                id="alert-threshold"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={threshold}
                onChange={(event) => setThreshold(event.target.value)}
                placeholder="0.00"
                className="tabular w-full bg-transparent text-sm text-paper focus:outline-none"
              />
            </div>
          </div>
        </div>
      ) : (
        <div>
          <label htmlFor="alert-trail" className="label mb-2 block">
            Alert me when it retreats
          </label>
          <div className="flex items-center gap-2 rounded-md border border-ink-800 bg-ink-950 px-3 py-2 focus-within:border-signal/60">
            <input
              id="alert-trail"
              type="number"
              inputMode="decimal"
              min="0.1"
              max="99"
              step="0.1"
              value={trailPercent}
              onChange={(event) => setTrailPercent(event.target.value)}
              className="tabular w-20 bg-transparent text-sm text-paper focus:outline-none"
            />
            <span className="text-sm text-muted">
              % from its {condition === 'BELOW' ? 'high' : 'low'}
            </span>
          </div>
          <p className="mt-2 text-xs text-faint">
            The level follows {symbol} as it {condition === 'BELOW' ? 'rises' : 'falls'} and never
            moves back.
            {trailingLevel !== null && (
              <>
                {' '}
                From today it sits at{' '}
                <span className="tabular text-muted">{formatPrice(trailingLevel, currency)}</span>.
              </>
            )}
          </p>
        </div>
      )}

      {typeof currentPrice === 'number' && (
        <p className="text-xs text-faint">
          {symbol} is trading at{' '}
          <span className="tabular text-muted">{formatPrice(currentPrice, currency)}</span>.
        </p>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowOptions((open) => !open)}
          aria-expanded={showOptions}
          className="text-xs font-medium text-muted transition hover:text-signal"
        >
          {showOptions ? 'Hide' : 'Show'} delivery options
        </button>

        {showOptions && (
          <div className="mt-3 space-y-4 rounded-md border border-ink-800 p-3.5">
            <div>
              <label htmlFor="alert-cooldown" className="label mb-2 block">
                How often it may fire
              </label>
              <select
                id="alert-cooldown"
                value={cooldownMinutes}
                onChange={(event) => setCooldownMinutes(Number(event.target.value))}
                className="w-full rounded-md border border-ink-800 bg-ink-950 px-3 py-2 text-sm text-paper"
              >
                {COOLDOWNS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-faint">
                A price chopping around your level can otherwise alert you repeatedly.
              </p>
            </div>

            <div>
              <label htmlFor="alert-expiry" className="label mb-2 block">
                Stop watching after
              </label>
              <input
                id="alert-expiry"
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                className="w-full rounded-md border border-ink-800 bg-ink-950 px-3 py-2 text-sm text-paper"
              />
              <p className="mt-1.5 text-xs text-faint">Leave empty to watch indefinitely.</p>
            </div>

            <label className="flex items-start gap-2.5 text-sm text-paper">
              <input
                type="checkbox"
                checked={marketHoursOnly}
                onChange={(event) => setMarketHoursOnly(event.target.checked)}
                className="mt-0.5 size-3.5 accent-[var(--color-signal)]"
              />
              <span>
                Regular hours only
                <span className="block text-xs text-faint">
                  Ignore pre-market and after-hours prints, which are thin and often
                  unrepresentative.
                </span>
              </span>
            </label>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || invalid}
          className="rounded-md bg-signal px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-signal/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Creating alert…' : 'Create alert'}
        </button>
        {confirmation && <p className="text-sm text-up">{confirmation}</p>}
      </div>

      {error && (
        <p className="text-sm text-down" role="alert">
          {error.message}
        </p>
      )}
    </form>
  );
}

export default AlertForm;
