/**
 * Pure alert-rule evaluation. No I/O here, so the latching behaviour is
 * directly testable.
 *
 * A rule fires on the transition into its condition, not while it stays there:
 *
 *   BUY AAPL below $200
 *     $201 -> nothing (condition not met)
 *     $199 -> TRIGGER   (met, latch was open)
 *     $198 -> nothing   (met, latch already closed)
 *     $201 -> reset     (condition no longer met, latch opens)
 *     $199 -> TRIGGER   (met again)
 *
 * Crucially, "met" is judged against the extreme price seen since the previous
 * observation, not just the last trade. The poller samples every few minutes, so
 * a price that dipped through the threshold and recovered between two samples
 * would otherwise be missed entirely — a real crossing the trader never hears
 * about. The latch *reset*, by contrast, uses the last trade: resetting on an
 * extreme would keep a rule latched long after the price came back.
 */

const TRIGGER_KINDS = { last: 'LAST', high: 'INTERVAL_HIGH', low: 'INTERVAL_LOW' };

const finite = (value) => {
  // Number(null) is 0 and Number('') is 0, either of which would satisfy a
  // "below $200" rule and fire on missing data.
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Accepts either a bare price or an observation carrying the extremes seen
 * since the previous poll.
 *
 * @param {number|{price: number, intervalHigh?: number, intervalLow?: number}} input
 */
export function normalizeSample(input) {
  if (input === null || input === undefined) return { price: null, intervalHigh: null, intervalLow: null };
  if (typeof input === 'object') {
    return {
      price: finite(input.price),
      intervalHigh: finite(input.intervalHigh),
      intervalLow: finite(input.intervalLow),
    };
  }
  return { price: finite(input), intervalHigh: null, intervalLow: null };
}

/**
 * The price a rule is judged against: the furthest the market went in the
 * direction the rule cares about.
 */
export function triggerCandidate(rule, sample) {
  const { price, intervalHigh, intervalLow } = normalizeSample(sample);
  if (price === null) return { price: null, kind: TRIGGER_KINDS.last };

  if (rule.condition === 'BELOW') {
    if (intervalLow !== null && intervalLow < price) {
      return { price: intervalLow, kind: TRIGGER_KINDS.low };
    }
    return { price, kind: TRIGGER_KINDS.last };
  }

  if (intervalHigh !== null && intervalHigh > price) {
    return { price: intervalHigh, kind: TRIGGER_KINDS.high };
  }
  return { price, kind: TRIGGER_KINDS.last };
}

/**
 * The level a rule is currently defending.
 *
 * A trailing rule does not defend a fixed number: it defends a distance from the
 * best price seen since it was armed, which is what a stop-loss actually is. A
 * fixed threshold goes stale the moment the stock moves.
 */
export function effectiveThreshold(rule) {
  const trail = finite(rule.trailPercent);
  const reference = finite(rule.referencePrice);
  if (trail === null || reference === null) return Number(rule.threshold);

  const fraction = trail / 100;
  return rule.condition === 'BELOW' ? reference * (1 - fraction) : reference * (1 + fraction);
}

/**
 * Where a trailing rule's reference should sit after this observation: the
 * highest high for a trailing stop, the lowest low for a trailing entry. It only
 * ever moves in the favourable direction.
 */
export function nextReferencePrice(rule, sample) {
  if (finite(rule.trailPercent) === null) return null;

  const { price, intervalHigh, intervalLow } = normalizeSample(sample);
  if (price === null) return null;

  const current = finite(rule.referencePrice);
  if (rule.condition === 'BELOW') {
    const candidate = Math.max(price, intervalHigh ?? price);
    return current === null || candidate > current ? candidate : null;
  }
  const candidate = Math.min(price, intervalLow ?? price);
  return current === null || candidate < current ? candidate : null;
}

export function isConditionMet(rule, price) {
  const value = finite(price);
  if (value === null) return false;
  const threshold = effectiveThreshold(rule);
  return rule.condition === 'BELOW' ? value <= threshold : value >= threshold;
}

/** Rules the poller must leave alone, and why. */
export function skipReason(rule, { now = new Date(), isRegularSession = true } = {}) {
  if (!rule.enabled) return 'disabled';
  if (rule.suspendedAt) return 'suspended';
  if (rule.expiresAt && new Date(rule.expiresAt).getTime() <= now.getTime()) return 'expired';

  // Extended-hours prints are thin and often unrepresentative, so a rule can opt
  // out of them rather than firing on a 200-share after-hours trade.
  if (rule.marketHoursOnly && !isRegularSession) return 'outside-regular-hours';

  const cooldown = finite(rule.cooldownMinutes);
  if (cooldown && rule.lastTriggeredAt) {
    const elapsedMs = now.getTime() - new Date(rule.lastTriggeredAt).getTime();
    if (elapsedMs < cooldown * 60_000) return 'cooldown';
  }

  return null;
}

export function buildMessage(rule, { triggerPrice, triggerKind, lastPrice }) {
  const threshold = effectiveThreshold(rule).toFixed(2);
  const crossed = Number(triggerPrice).toFixed(2);
  const direction = rule.condition === 'BELOW' ? 'fell to' : 'rose to';

  if (finite(rule.trailPercent) !== null && finite(rule.referencePrice) !== null) {
    const peak = rule.condition === 'BELOW' ? 'high' : 'low';
    return (
      `${rule.symbol} ${direction} $${crossed}, ${rule.trailPercent}% from its $${Number(
        rule.referencePrice,
      ).toFixed(2)} ${peak} — your trailing ${rule.type} level of $${threshold}.`
    );
  }

  // An extreme trigger means the price passed through the level and may already
  // have moved away, so the message says both numbers rather than implying the
  // market is still there.
  if (triggerKind !== TRIGGER_KINDS.last && lastPrice !== null && lastPrice !== undefined) {
    return (
      `${rule.symbol} traded through your ${rule.type} threshold of $${threshold} ` +
      `(${rule.condition === 'BELOW' ? 'low' : 'high'} $${crossed}), and is now at ` +
      `$${Number(lastPrice).toFixed(2)}.`
    );
  }

  return `${rule.symbol} ${direction} $${crossed}, ${
    rule.condition === 'BELOW' ? 'at or below' : 'at or above'
  } your ${rule.type} threshold of $${threshold}.`;
}

/**
 * Decides what should happen to one rule given an observation.
 *
 * @returns {{action: 'trigger'|'reset'|'none', message?: string, triggerPrice?: number, triggerKind?: string}}
 */
export function evaluateRule(rule, sample, context = {}) {
  const skipped = skipReason(rule, context);
  if (skipped) {
    // A cooldown or session filter must not silently swallow a latch reset, or
    // the rule could stay armed-but-latched indefinitely.
    if (skipped === 'cooldown' || skipped === 'outside-regular-hours') {
      const { price: current } = normalizeSample(sample);
      if (current !== null && rule.triggered && !isConditionMet(rule, current)) {
        return { action: 'reset', skipped };
      }
    }
    return { action: 'none', skipped };
  }

  const { price } = normalizeSample(sample);
  if (price === null) return { action: 'none' };

  const candidate = triggerCandidate(rule, sample);
  const metByExtreme = isConditionMet(rule, candidate.price);
  const metByLast = isConditionMet(rule, price);

  if (metByExtreme && !rule.triggered) {
    return {
      action: 'trigger',
      triggerPrice: candidate.price,
      triggerKind: candidate.kind,
      // Latch only while the market is still past the line. If it already came
      // back, the rule re-arms immediately so a second dip in the next interval
      // fires again — two real crossings, two alerts.
      latch: metByLast,
      message: buildMessage(rule, {
        triggerPrice: candidate.price,
        triggerKind: candidate.kind,
        lastPrice: price,
      }),
    };
  }

  // Reset on the last trade: the rule re-arms once the market is back on the
  // other side of the line, even if it briefly went through during the interval.
  if (!metByLast && rule.triggered) return { action: 'reset' };

  return { action: 'none' };
}

/** Evaluates every rule for one symbol against a single observation. */
export function evaluateRules(rules, sample, context = {}) {
  return rules.map((rule) => ({ rule, ...evaluateRule(rule, sample, context) }));
}

export default {
  normalizeSample,
  triggerCandidate,
  effectiveThreshold,
  nextReferencePrice,
  skipReason,
  isConditionMet,
  buildMessage,
  evaluateRule,
  evaluateRules,
  TRIGGER_KINDS,
};
