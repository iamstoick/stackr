const currencyFormatters = new Map();

function currencyFormatter(currency = 'USD') {
  if (!currencyFormatters.has(currency)) {
    currencyFormatters.set(
      currency,
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    );
  }
  return currencyFormatters.get(currency);
}

export function formatPrice(value, currency = 'USD') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return currencyFormatter(currency).format(Number(value));
}

export function formatChange(value, currency = 'USD') {
  if (value === null || value === undefined) return '—';
  const sign = Number(value) > 0 ? '+' : '';
  return `${sign}${currencyFormatter(currency).format(Number(value))}`;
}

export function formatPercent(value) {
  if (value === null || value === undefined) return '—';
  const sign = Number(value) > 0 ? '+' : '';
  return `${sign}${Number(value).toFixed(2)}%`;
}

export function formatCompact(value) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
    Number(value),
  );
}

/** Timestamps arrive as UTC ISO strings and are rendered in the viewer's zone. */
export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatRelative(iso) {
  if (!iso) return 'never';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Axis tick formatting depends on how much time the chart spans. */
export function formatAxisTime(iso, granularity) {
  const date = new Date(iso);
  switch (granularity) {
    case 'minute':
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    case 'hour':
      return date.toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit' });
    case 'day':
    case 'week':
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    default:
      return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  }
}

export function directionOf(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return 'flat';
  return n > 0 ? 'up' : 'down';
}

export const MARKET_SESSION_LABEL = {
  open: 'Market open',
  pre: 'Pre-market',
  post: 'After hours',
  closed: 'Market closed',
  holiday: 'Market holiday',
  weekend: 'Weekend',
};

/**
 * One honest sentence about where a price came from. Outside regular hours the
 * provider's number is the last regular-session trade, so it is never described
 * as current.
 */
export function describeQuoteSource(data) {
  if (!data) return null;

  if (data.source === 'cache') return `Last stored price, ${formatRelative(data.asOf)}`;
  if (data.marketSession === 'holiday') {
    return `Closed for ${data.sessionLabel ?? 'a holiday'} · last trade ${formatRelative(data.asOf)}`;
  }
  if (data.regularSessionOnly) {
    return `Last regular-session trade, ${formatRelative(data.asOf)}`;
  }
  return `Quoted ${formatRelative(data.asOf)}`;
}

export default {
  formatPrice,
  formatChange,
  formatPercent,
  formatCompact,
  formatDate,
  formatDateTime,
  formatRelative,
  formatAxisTime,
  describeQuoteSource,
  directionOf,
};
