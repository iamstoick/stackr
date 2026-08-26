import { useEffect, useState } from 'react';

import paperApi from '../services/paperApi.js';
import useDebounce from '../hooks/useDebounce.js';
import { formatPercent, formatPrice } from '../utils/format.js';
import { HelpTip } from './HelpTip.jsx';

const SIDES = [
  { value: 'BUY', label: 'Buy' },
  { value: 'SELL', label: 'Sell' },
];

/**
 * Places a simulated order.
 *
 * The preview is the teaching surface: before anything happens the learner sees
 * the fill price, the spread they are paying, and how far the price must move
 * just to break even. Those three numbers answer "why did I lose money when the
 * price didn't change?" before it gets a chance to confuse anyone.
 */
export function TradeTicket({ symbol, currency = 'USD', onTraded }) {
  const [side, setSide] = useState('BUY');
  const [quantity, setQuantity] = useState('1');
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const debouncedQuantity = useDebounce(quantity, 300);
  const size = Number(debouncedQuantity);
  const valid = Number.isFinite(size) && size > 0;

  useEffect(() => {
    if (!valid) {
      setPreview(null);
      return undefined;
    }

    const controller = new AbortController();
    setPreviewError(null);

    paperApi
      .previewOrder({ symbol, side, quantity: size }, { signal: controller.signal })
      .then(setPreview)
      .catch((err) => {
        if (err.code !== 'ERR_CANCELED') setPreviewError(err);
      });

    return () => controller.abort();
  }, [symbol, side, size, valid, result]);

  const submit = async (event) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setResult(null);

    try {
      const placed = await paperApi.placeOrder({ symbol, side, quantity: size });
      setResult(placed);
      onTraded?.(placed);
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };

  const order = preview?.order;
  const blocked = side === 'BUY' ? preview && !preview.affordable : preview?.heldQuantity === 0;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div role="group" aria-label="Side" className="inline-flex rounded-md border border-ink-800 p-0.5">
          {SIDES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSide(option.value)}
              aria-pressed={side === option.value}
              className={`rounded px-3 py-1 text-sm font-medium transition ${
                side === option.value
                  ? option.value === 'BUY'
                    ? 'bg-up/15 text-up'
                    : 'bg-down/15 text-down'
                  : 'text-muted hover:text-paper'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <span className="label">Practice money</span>
      </div>

      <div>
        <label htmlFor="trade-quantity" className="label mb-2 block">
          Shares
        </label>
        <div className="flex items-center gap-2">
          <input
            id="trade-quantity"
            type="number"
            inputMode="decimal"
            min="0.0001"
            step="any"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="tabular w-32 rounded-md border border-ink-800 bg-ink-950 px-3 py-2 text-sm text-paper focus:border-signal/60 focus:outline-none"
          />
          {side === 'BUY' && preview?.maxAffordableQuantity > 0 && (
            <button
              type="button"
              onClick={() => setQuantity(String(preview.maxAffordableQuantity))}
              className="rounded-md border border-ink-700 px-2.5 py-1 text-xs text-muted transition hover:border-signal hover:text-signal"
            >
              Max {preview.maxAffordableQuantity}
            </button>
          )}
          {side === 'SELL' && preview?.heldQuantity > 0 && (
            <button
              type="button"
              onClick={() => setQuantity(String(preview.heldQuantity))}
              className="rounded-md border border-ink-700 px-2.5 py-1 text-xs text-muted transition hover:border-signal hover:text-signal"
            >
              All {preview.heldQuantity}
            </button>
          )}
        </div>
      </div>

      {order && (
        <dl className="space-y-1.5 rounded-md border border-ink-800 bg-ink-950 p-3 text-xs">
          <Row label="Quoted price" value={formatPrice(order.quotePrice, currency)} />
          <Row
            label={side === 'BUY' ? 'You buy at' : 'You sell at'}
            value={formatPrice(order.fillPrice, currency)}
            term="fillPrice"
            emphasis
          />
          <Row
            label={`Spread (${order.spreadBps} bps)`}
            value={`−${formatPrice(order.spreadCost, currency)}`}
            term="spread"
          />
          {order.commission > 0 && (
            <Row label="Commission" value={`−${formatPrice(order.commission, currency)}`} />
          )}
          <div className="mt-2 border-t border-ink-800 pt-2">
            <Row
              label={side === 'BUY' ? 'Cash out' : 'Cash in'}
              value={formatPrice(Math.abs(order.cashDelta), currency)}
              emphasis
            />
            <Row label="Cash left after" value={formatPrice(preview.cashAfter, currency)} />
          </div>

          {side === 'BUY' && (
            <p className="mt-2 border-t border-ink-800 pt-2 text-faint">
              {symbol} has to rise{' '}
              <span className="tabular text-signal">
                {formatPercent(order.breakEvenMovePercent)}
              </span>{' '}
              before this trade breaks even — you pay the spread getting in and again getting out.
            </p>
          )}
        </dl>
      )}

      {preview?.wouldQueue && (
        <p className="rounded-md border border-signal/40 bg-signal/5 p-3 text-xs text-muted">
          The market is closed. Stackr will fill this at the last traded price so you can practise,
          but a real broker would hold the order until the next open — and the opening price is often
          different.
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !valid || blocked}
        className={`w-full rounded-md px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
          side === 'BUY' ? 'bg-up text-ink-950 hover:bg-up/90' : 'bg-down text-ink-950 hover:bg-down/90'
        }`}
      >
        {pending ? 'Placing…' : `${side === 'BUY' ? 'Buy' : 'Sell'} ${valid ? size : ''} ${symbol}`}
      </button>

      {blocked && side === 'BUY' && (
        <p className="text-xs text-down">Not enough practice cash for this order.</p>
      )}
      {blocked && side === 'SELL' && (
        <p className="text-xs text-muted">You do not hold any {symbol} to sell.</p>
      )}

      {result && (
        <div className="rounded-md border border-up/40 bg-up/5 p-3 text-xs">
          <p className="text-paper">
            {result.trade.side === 'BUY' ? 'Bought' : 'Sold'}{' '}
            <span className="tabular">{result.trade.quantity}</span> {result.trade.symbol} at{' '}
            <span className="tabular">{formatPrice(result.trade.fillPrice, currency)}</span>.
          </p>
          {result.realizedPnl !== null && result.realizedPnl !== undefined && (
            <p className={`mt-1 ${result.realizedPnl >= 0 ? 'text-up' : 'text-down'}`}>
              Realised {result.realizedPnl >= 0 ? 'profit' : 'loss'} of{' '}
              <span className="tabular">{formatPrice(Math.abs(result.realizedPnl), currency)}</span>.
            </p>
          )}
          {result.lesson && <p className="mt-1.5 text-faint">{result.lesson}</p>}
        </div>
      )}

      {(error || previewError) && (
        <p className="text-xs text-down" role="alert">
          {(error ?? previewError).message}
        </p>
      )}

      <p className="text-xs text-faint">
        Simulated only. No real money, no real orders, and nothing here is advice.
      </p>
    </form>
  );
}

function Row({ label, value, term, emphasis = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex items-center gap-1.5 text-faint">
        {label}
        {term === 'spread' && (
          <HelpTip
            title="Spread"
            body="Buyers and sellers never meet at one price. You buy slightly above the quote and sell slightly below it, and that gap is a cost you pay without seeing a fee."
          />
        )}
        {term === 'fillPrice' && (
          <HelpTip
            title="Fill price"
            body="The price you actually get, which is not the price on the screen. Buys fill a little higher, sells a little lower."
          />
        )}
      </dt>
      <dd className={`tabular ${emphasis ? 'font-medium text-paper' : 'text-muted'}`}>{value}</dd>
    </div>
  );
}

export default TradeTicket;
