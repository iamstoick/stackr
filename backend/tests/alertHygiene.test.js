import { describe, expect, it } from 'vitest';

import {
  effectiveThreshold,
  evaluateRule,
  nextReferencePrice,
  skipReason,
} from '../src/services/alerts/alertEvaluator.js';

const NOW = new Date('2026-08-21T17:00:00Z');

const rule = (overrides = {}) => ({
  id: 1,
  symbol: 'AAPL',
  type: 'BUY',
  condition: 'BELOW',
  threshold: 200,
  enabled: true,
  triggered: false,
  suspendedAt: null,
  cooldownMinutes: 0,
  expiresAt: null,
  marketHoursOnly: false,
  trailPercent: null,
  referencePrice: null,
  lastTriggeredAt: null,
  ...overrides,
});

describe('cooldown', () => {
  it('suppresses a second alert inside the cooldown window', () => {
    const recent = rule({
      cooldownMinutes: 30,
      lastTriggeredAt: new Date(NOW.getTime() - 10 * 60_000),
    });
    const result = evaluateRule(recent, { price: 195 }, { now: NOW });

    expect(result.action).toBe('none');
    expect(result.skipped).toBe('cooldown');
  });

  it('fires again once the cooldown has elapsed', () => {
    const cooled = rule({
      cooldownMinutes: 30,
      lastTriggeredAt: new Date(NOW.getTime() - 31 * 60_000),
    });
    expect(evaluateRule(cooled, { price: 195 }, { now: NOW }).action).toBe('trigger');
  });

  it('still re-arms a latched rule during a cooldown', () => {
    // Otherwise a rule could sit latched through its cooldown and then miss the
    // next genuine crossing.
    const latched = rule({
      cooldownMinutes: 30,
      triggered: true,
      lastTriggeredAt: new Date(NOW.getTime() - 5 * 60_000),
    });
    expect(evaluateRule(latched, { price: 210 }, { now: NOW }).action).toBe('reset');
  });
});

describe('expiry', () => {
  it('ignores a rule past its expiry', () => {
    const expired = rule({ expiresAt: new Date(NOW.getTime() - 1000) });
    expect(skipReason(expired, { now: NOW })).toBe('expired');
    expect(evaluateRule(expired, { price: 195 }, { now: NOW }).action).toBe('none');
  });

  it('honours a rule that has not expired yet', () => {
    const live = rule({ expiresAt: new Date(NOW.getTime() + 60_000) });
    expect(evaluateRule(live, { price: 195 }, { now: NOW }).action).toBe('trigger');
  });
});

describe('market-hours-only', () => {
  it('does not fire on an extended-hours print when asked not to', () => {
    const regularOnly = rule({ marketHoursOnly: true });
    const result = evaluateRule(regularOnly, { price: 195 }, { now: NOW, isRegularSession: false });

    expect(result.action).toBe('none');
    expect(result.skipped).toBe('outside-regular-hours');
  });

  it('fires during the regular session', () => {
    const regularOnly = rule({ marketHoursOnly: true });
    expect(
      evaluateRule(regularOnly, { price: 195 }, { now: NOW, isRegularSession: true }).action,
    ).toBe('trigger');
  });

  it('fires in extended hours by default', () => {
    expect(evaluateRule(rule(), { price: 195 }, { now: NOW, isRegularSession: false }).action).toBe(
      'trigger',
    );
  });
});

describe('trailing rules', () => {
  it('derives a trailing stop level from the high-water mark', () => {
    // 8% trailing stop measured from a $250 peak.
    const trailing = rule({ trailPercent: 8, referencePrice: 250, condition: 'BELOW' });
    expect(effectiveThreshold(trailing)).toBeCloseTo(230, 6);
  });

  it('derives a trailing entry level from the low-water mark', () => {
    const trailing = rule({
      type: 'BUY',
      condition: 'ABOVE',
      trailPercent: 5,
      referencePrice: 100,
    });
    expect(effectiveThreshold(trailing)).toBeCloseTo(105, 6);
  });

  it('falls back to the fixed threshold before a reference exists', () => {
    expect(effectiveThreshold(rule({ trailPercent: 8 }))).toBe(200);
  });

  it('ratchets the reference up on a new high, never down', () => {
    const trailing = rule({ trailPercent: 8, referencePrice: 250, condition: 'BELOW' });

    expect(nextReferencePrice(trailing, { price: 255, intervalHigh: 258 })).toBe(258);
    expect(nextReferencePrice(trailing, { price: 240, intervalHigh: 245 })).toBe(null);
  });

  it('ratchets an entry reference down on a new low', () => {
    const trailing = rule({ condition: 'ABOVE', trailPercent: 5, referencePrice: 100 });

    expect(nextReferencePrice(trailing, { price: 96, intervalLow: 95 })).toBe(95);
    expect(nextReferencePrice(trailing, { price: 104, intervalLow: 103 })).toBe(null);
  });

  it('seeds the reference from the first observation', () => {
    expect(nextReferencePrice(rule({ trailPercent: 8 }), { price: 120 })).toBe(120);
  });

  it('leaves fixed rules alone', () => {
    expect(nextReferencePrice(rule(), { price: 120, intervalHigh: 130 })).toBe(null);
  });

  it('triggers when the price falls the trailing distance from the peak', () => {
    const trailing = rule({ trailPercent: 8, referencePrice: 250, condition: 'BELOW' });

    expect(evaluateRule(trailing, { price: 231 }, { now: NOW }).action).toBe('none');
    const fired = evaluateRule(trailing, { price: 229 }, { now: NOW });
    expect(fired.action).toBe('trigger');
    expect(fired.message).toMatch(/8% from its \$250\.00 high/);
  });

  it('does not trigger a trailing stop that the market has outrun upward', () => {
    // Peak moved to 300, so the stop is 276 — a 280 print is still safe.
    const trailing = rule({ trailPercent: 8, referencePrice: 300, condition: 'BELOW' });
    expect(evaluateRule(trailing, { price: 280 }, { now: NOW }).action).toBe('none');
  });
});
