/**
 * Detects when a provider has re-based a symbol's price series — a split,
 * reverse split, or similar corporate action.
 *
 * This matters because a threshold is an absolute number. After a 4-for-1 split,
 * a "SELL above $400" rule is suddenly $100 away from a price that did not
 * really move, and every rule on that symbol would fire on an event that is
 * economically neutral. Silently firing on a split is how a monitoring tool
 * loses a user's trust for good, so affected rules are suspended and the owner
 * is told, rather than guessed at.
 *
 * The signal used is the provider's own previous close against the price we last
 * stored. Both describe the same prior session, so a large disagreement means
 * the series was adjusted underneath us — not that the market moved. A genuine
 * overnight gap moves the *current* price away from the previous close, but
 * leaves the previous close itself intact, which is why that is the comparison
 * that separates a corporate action from news.
 */

// Ratios beyond these bounds are treated as a re-based series rather than a move.
const LOWER_BOUND = 0.8;
const UPPER_BOUND = 1.25;

// Ratios worth naming explicitly, since they cover almost all real splits.
const COMMON_SPLITS = [2, 3, 4, 5, 6, 7, 10, 20, 1.5];
const SPLIT_TOLERANCE = 0.04;

function describeRatio(ratio) {
  for (const factor of COMMON_SPLITS) {
    if (Math.abs(ratio - factor) / factor <= SPLIT_TOLERANCE) {
      return `suspected ${formatFactor(factor)}-for-1 split`;
    }
    if (Math.abs(ratio - 1 / factor) * factor <= SPLIT_TOLERANCE) {
      return `suspected 1-for-${formatFactor(factor)} reverse split`;
    }
  }
  return 'price series was re-based by the data provider';
}

const formatFactor = (factor) => (Number.isInteger(factor) ? String(factor) : factor.toFixed(1));

/**
 * @param {{price: number|null}|null} previous last stored price row
 * @param {{previousClose: number|null, price: number|null}} quote fresh quote
 * @returns {null|{reason: string, ratio: number, storedPrice: number, providerPreviousClose: number}}
 */
export function detectCorporateAction(previous, quote) {
  const stored = Number(previous?.price);
  const providerPreviousClose = Number(quote?.previousClose);

  if (!Number.isFinite(stored) || stored <= 0) return null;
  if (!Number.isFinite(providerPreviousClose) || providerPreviousClose <= 0) return null;

  const ratio = stored / providerPreviousClose;
  if (ratio >= LOWER_BOUND && ratio <= UPPER_BOUND) return null;

  return {
    ratio: Number(ratio.toFixed(4)),
    storedPrice: stored,
    providerPreviousClose,
    reason: describeRatio(ratio),
  };
}

/** Human-facing explanation attached to the system alert and the paused rule. */
export function buildNotice(symbol, detection) {
  const factor =
    detection.ratio > 1
      ? `about ${detection.ratio.toFixed(2)}×`
      : `about 1/${(1 / detection.ratio).toFixed(2)}`;

  return (
    `Alerts on ${symbol} were paused: ${detection.reason}. The last price we stored was ` +
    `$${detection.storedPrice.toFixed(2)} but the provider now reports a previous close of ` +
    `$${detection.providerPreviousClose.toFixed(2)} (${factor}). Check your thresholds and resume ` +
    'the rules you still want.'
  );
}

export default { detectCorporateAction, buildNotice };
