import { describe, expect, it } from 'vitest';

import { evaluateRule, triggerCandidate } from '../src/services/alerts/alertEvaluator.js';
import { deriveInterval } from '../src/services/market/priceObserver.js';

const rule = (overrides = {}) => ({
  id: 1,
  symbol: 'AAPL',
  type: 'BUY',
  condition: 'BELOW',
  threshold: 200,
  enabled: true,
  triggered: false,
  suspendedAt: null,
  ...overrides,
});

describe('deriveInterval', () => {
  const sessionDate = '2026-08-21';

  it('uses only the last trade on the first observation of a session', () => {
    // The session's high and low may predate the rule, so they cannot be used.
    const interval = deriveInterval(null, { price: 205, high: 240, low: 180 }, { sessionDate });
    expect(interval).toMatchObject({ intervalHigh: 205, intervalLow: 205, isFirstOfSession: true });
  });

  it('resets the extremes when the trading day rolls over', () => {
    const previous = { sessionDate: '2026-08-20', price: 210, high: 212, low: 205 };
    const interval = deriveInterval(previous, { price: 205, high: 206, low: 190 }, { sessionDate });
    expect(interval).toMatchObject({ intervalLow: 205, isFirstOfSession: true });
  });

  it('attributes a new session low to the interval just elapsed', () => {
    // Previous poll saw a low of 205; now the session low is 195, so the market
    // must have traded at 195 between the two polls.
    const previous = { sessionDate, price: 206, high: 210, low: 205 };
    const interval = deriveInterval(previous, { price: 207, high: 210, low: 195 }, { sessionDate });

    expect(interval.intervalLow).toBe(195);
    expect(interval.intervalHigh).toBe(207); // no new high, so bounded by the last trade
  });

  it('attributes a new session high to the interval just elapsed', () => {
    const previous = { sessionDate, price: 206, high: 210, low: 205 };
    const interval = deriveInterval(previous, { price: 208, high: 215, low: 205 }, { sessionDate });

    expect(interval.intervalHigh).toBe(215);
    expect(interval.intervalLow).toBe(208);
  });

  it('falls back to the last trade when neither extreme moved', () => {
    const previous = { sessionDate, price: 206, high: 210, low: 205 };
    const interval = deriveInterval(previous, { price: 207, high: 210, low: 205 }, { sessionDate });
    expect(interval).toMatchObject({ intervalHigh: 207, intervalLow: 207 });
  });

  it('handles a missing price without inventing a range', () => {
    const interval = deriveInterval(null, { price: null }, { sessionDate });
    expect(interval).toMatchObject({ intervalHigh: null, intervalLow: null });
  });
});

describe('triggerCandidate', () => {
  it('judges a BELOW rule on the interval low', () => {
    expect(triggerCandidate(rule(), { price: 207, intervalLow: 195, intervalHigh: 207 })).toEqual({
      price: 195,
      kind: 'INTERVAL_LOW',
    });
  });

  it('judges an ABOVE rule on the interval high', () => {
    const sell = rule({ type: 'SELL', condition: 'ABOVE', threshold: 210 });
    expect(triggerCandidate(sell, { price: 207, intervalLow: 200, intervalHigh: 215 })).toEqual({
      price: 215,
      kind: 'INTERVAL_HIGH',
    });
  });

  it('ignores the extreme in the direction the rule does not care about', () => {
    expect(triggerCandidate(rule(), { price: 207, intervalLow: 207, intervalHigh: 260 })).toEqual({
      price: 207,
      kind: 'LAST',
    });
  });

  it('accepts a bare price for callers that have no range', () => {
    expect(triggerCandidate(rule(), 199)).toEqual({ price: 199, kind: 'LAST' });
  });
});

describe('evaluateRule — crossings between polls', () => {
  it('fires on a dip that already reversed before the next poll', () => {
    // The whole point: at 10:00 the price is 207, at 10:05 it is 207 again, but
    // it traded at 195 in between. The old last-price-only check saw nothing.
    const result = evaluateRule(rule(), { price: 207, intervalLow: 195, intervalHigh: 207 });

    expect(result.action).toBe('trigger');
    expect(result.triggerPrice).toBe(195);
    expect(result.triggerKind).toBe('INTERVAL_LOW');
    expect(result.message).toMatch(/traded through/);
    expect(result.message).toContain('195.00');
    expect(result.message).toContain('207.00');
  });

  it('re-arms immediately when the price has already come back', () => {
    // Nothing to latch onto: the condition is not currently true, so a second
    // dip in the next interval must fire again.
    expect(evaluateRule(rule(), { price: 207, intervalLow: 195 }).latch).toBe(false);
  });

  it('latches while the price is still below the line', () => {
    const result = evaluateRule(rule(), { price: 196, intervalLow: 195 });
    expect(result.action).toBe('trigger');
    expect(result.latch).toBe(true);
    expect(result.triggerPrice).toBe(195);
  });

  it('fires twice for two separate crossings in consecutive intervals', () => {
    let current = rule();
    const actions = [];

    for (const sample of [
      { price: 207, intervalLow: 195 }, // dipped and recovered
      { price: 208, intervalLow: 197 }, // dipped and recovered again
    ]) {
      const result = evaluateRule(current, sample);
      actions.push(result.action);
      if (result.action === 'trigger') current = { ...current, triggered: result.latch };
    }

    expect(actions).toEqual(['trigger', 'trigger']);
  });

  it('still fires only once while the price stays below the line', () => {
    let current = rule();
    const actions = [];

    for (const sample of [
      { price: 199, intervalLow: 199 },
      { price: 198, intervalLow: 197 },
      { price: 197, intervalLow: 196 },
    ]) {
      const result = evaluateRule(current, sample);
      actions.push(result.action);
      if (result.action === 'trigger') current = { ...current, triggered: result.latch };
      if (result.action === 'reset') current = { ...current, triggered: false };
    }

    expect(actions).toEqual(['trigger', 'none', 'none']);
  });

  it('resets on the last trade, not on an extreme', () => {
    // A latched rule whose interval dipped again but whose last price is back
    // above the line must re-arm, not stay stuck.
    const latched = rule({ triggered: true });
    expect(evaluateRule(latched, { price: 205, intervalLow: 198 }).action).toBe('reset');
  });

  it('never fires a suspended rule', () => {
    const suspended = rule({ suspendedAt: new Date() });
    expect(evaluateRule(suspended, { price: 150, intervalLow: 150 }).action).toBe('none');
  });

  it('phrases a straightforward crossing without the traded-through wording', () => {
    const result = evaluateRule(rule(), { price: 196, intervalLow: 196 });
    expect(result.message).not.toMatch(/traded through/);
    expect(result.message).toMatch(/fell to \$196\.00/);
  });
});
