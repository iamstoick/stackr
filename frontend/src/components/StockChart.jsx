import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatAxisTime, formatDateTime, formatPrice } from '../utils/format.js';
import { EmptyState } from './EmptyState.jsx';
import { ErrorState } from './ErrorState.jsx';
import { HelpTip } from './HelpTip.jsx';
import { SkeletonRows } from './Loading.jsx';

function ChartTooltip({ active, payload, currency }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  // The bar's full range, not just its close: a trader reads the wick. Spelled
  // out rather than abbreviated to O/H/L/C, which means nothing to a beginner.
  const ohlc = [
    ['Open', point.open],
    ['High', point.high],
    ['Low', point.low],
    ['Close', point.close],
  ].filter(([, value]) => typeof value === 'number');

  return (
    <div className="panel px-3 py-2 text-xs shadow-xl shadow-black/60">
      <p className="label mb-1.5">{formatDateTime(point.time)}</p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {ohlc.map(([key, value]) => (
          <div key={key} className="col-span-2 grid grid-cols-subgrid">
            <dt className="text-faint">{key}</dt>
            <dd
              className={`tabular text-right ${
                key === 'Close' ? 'font-medium text-paper' : 'text-muted'
              }`}
            >
              {formatPrice(value, currency)}
            </dd>
          </div>
        ))}
      </dl>

      {point.volume ? (
        <p className="tabular mt-1.5 border-t border-ink-800 pt-1.5 text-faint">
          Vol {new Intl.NumberFormat(undefined, { notation: 'compact' }).format(point.volume)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Price history. Threshold rules are drawn onto the same canvas in the amber
 * signal colour, so "how far is the price from my line" is answered by looking
 * at the chart rather than by reading the alert list.
 */
export function StockChart({
  candles,
  thresholds = [],
  currency = 'USD',
  currentPrice = null,
  isLoading,
  error,
  onRetry,
}) {
  const points = candles?.points ?? [];

  const domain = useMemo(() => {
    if (points.length === 0) return ['auto', 'auto'];

    const closes = points.map((p) => p.close).filter((v) => typeof v === 'number');
    const lines = thresholds.map((t) => Number(t.threshold)).filter(Number.isFinite);
    const live = Number.isFinite(currentPrice) ? [Number(currentPrice)] : [];
    const values = [...closes, ...lines, ...live];
    if (values.length === 0) return ['auto', 'auto'];

    // Pad by 4% so the series never touches the frame, and always keep every
    // threshold line inside the visible range.
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.04, max * 0.002, 0.01);
    return [min - pad, max + pad];
  }, [points, thresholds, currentPrice]);

  if (isLoading && points.length === 0) {
    return (
      <div className="h-[340px]">
        <SkeletonRows rows={5} className="pt-8" />
      </div>
    );
  }

  if (error) {
    return <ErrorState error={error} onRetry={onRetry} className="border-0" />;
  }

  if (points.length === 0) {
    return (
      <EmptyState
        title="No price history for this timeframe"
        description="The provider returned no candles for this range. Try a wider timeframe."
      />
    );
  }

  const first = points[0]?.close ?? 0;
  const last = points[points.length - 1]?.close ?? 0;
  const rising = last >= first;
  const stroke = rising ? 'var(--color-up)' : 'var(--color-down)';
  const hasVolume = points.some((point) => typeof point.volume === 'number' && point.volume > 0);

  return (
    <>
    <div className="h-[340px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="var(--color-ink-800)" strokeDasharray="2 6" vertical={false} />

          <XAxis
            dataKey="time"
            tickFormatter={(value) => formatAxisTime(value, candles?.granularity)}
            stroke="var(--color-faint)"
            tick={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-ink-800)' }}
            minTickGap={48}
          />
          <YAxis
            domain={domain}
            orientation="right"
            width={72}
            stroke="var(--color-faint)"
            tick={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => formatPrice(value, currency).replace(/[^\d.,-]/g, '')}
          />

          <Tooltip
            content={<ChartTooltip currency={currency} />}
            cursor={{ stroke: 'var(--color-ink-700)', strokeWidth: 1 }}
          />

          {/* The live quote comes from a different provider than the bars, so
              the last trade is drawn explicitly instead of leaving the reader to
              wonder why the final bar's close differs from the header price. */}
          {Number.isFinite(currentPrice) && (
            <ReferenceLine
              y={Number(currentPrice)}
              stroke="var(--color-muted)"
              strokeDasharray="2 3"
              strokeOpacity={0.7}
              label={{
                value: `last ${Number(currentPrice).toFixed(2)}`,
                position: 'insideBottomRight',
                fill: 'var(--color-muted)',
                fontSize: 10,
                fontFamily: 'IBM Plex Mono, monospace',
              }}
            />
          )}

          {thresholds.map((rule) => (
            <ReferenceLine
              key={rule.id}
              y={Number(rule.threshold)}
              stroke="var(--color-signal)"
              strokeDasharray="5 4"
              strokeOpacity={rule.enabled && !rule.suspendedAt ? 0.9 : 0.35}
              label={{
                value: `${rule.type} ${rule.condition === 'BELOW' ? '≤' : '≥'} ${Number(rule.threshold).toFixed(2)}`,
                position: 'insideTopLeft',
                fill: 'var(--color-signal)',
                fontSize: 10,
                fontFamily: 'IBM Plex Mono, monospace',
              }}
            />
          ))}

          <Area
            type="monotone"
            dataKey="close"
            stroke={stroke}
            strokeWidth={1.75}
            fill="url(#priceFill)"
            dot={false}
            activeDot={{ r: 3, fill: stroke, stroke: 'var(--color-ink-950)', strokeWidth: 2 }}
            animationDuration={320}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>

    {/* Every mark on the chart, named and explained. New readers should not have
        to guess what a dashed amber line means. */}
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-800 pt-3 text-xs text-muted">
      <LegendItem term="priceLine" label="Price">
        <span aria-hidden="true" className="block h-0.5 w-4 rounded-full" style={{ background: stroke }} />
      </LegendItem>

      {thresholds.length > 0 && (
        <LegendItem term="thresholdLine" label="Your threshold">
          <span
            aria-hidden="true"
            className="block h-0.5 w-4 bg-[repeating-linear-gradient(to_right,var(--color-signal)_0_5px,transparent_5px_9px)]"
          />
        </LegendItem>
      )}

      {Number.isFinite(currentPrice) && (
        <LegendItem term="lastPriceLine" label="Last price">
          <span
            aria-hidden="true"
            className="block h-0.5 w-4 bg-[repeating-linear-gradient(to_right,var(--color-muted)_0_2px,transparent_2px_5px)]"
          />
        </LegendItem>
      )}

      <LegendItem term="timeAxis" label="Time →" />
      <LegendItem term="priceAxis" label="Price scale" />
      <LegendItem term="ohlc" label="Open / high / low / close" />
      {hasVolume && <LegendItem term="volume" label="Volume" />}
    </ul>
    </>
  );
}

/** One named mark in the chart legend, with its beginner explanation. */
function LegendItem({ term, label, children }) {
  return (
    <li className="flex items-center gap-2">
      {children}
      <HelpTip term={term}>{label}</HelpTip>
    </li>
  );
}

export default StockChart;
