import { describe, expect, it } from 'vitest';

import { evaluateRule, isConditionMet } from '../src/services/alerts/alertEvaluator.js';

const rule = (overrides = {}) => ({
  id: 1,
  symbol: 'AAPL',
  type: 'BUY',
  condition: 'BELOW',
  threshold: 200,
  enabled: true,
  triggered: false,
  ...overrides,
});

describe('isConditionMet', () => {
  it('treats BELOW as at-or-below the threshold', () => {
    expect(isConditionMet(rule(), 199)).toBe(true);
    expect(isConditionMet(rule(), 200)).toBe(true);
    expect(isConditionMet(rule(), 200.01)).toBe(false);
  });

  it('treats ABOVE as at-or-above the threshold', () => {
    const r = rule({ type: 'SELL', condition: 'ABOVE', threshold: 210 });
    expect(isConditionMet(r, 210)).toBe(true);
    expect(isConditionMet(r, 211)).toBe(true);
    expect(isConditionMet(r, 209.99)).toBe(false);
  });

  it('never fires on a missing or non-numeric price', () => {
    expect(isConditionMet(rule(), null)).toBe(false);
    expect(isConditionMet(rule(), Number.NaN)).toBe(false);
    expect(isConditionMet(rule(), undefined)).toBe(false);
  });

  it('handles thresholds arriving as numeric strings from pg', () => {
    expect(isConditionMet(rule({ threshold: '200.0000' }), 199)).toBe(true);
    expect(isConditionMet(rule({ threshold: '200.0000' }), 201)).toBe(false);
  });
});

describe('evaluateRule — latching', () => {
  it('walks the documented BUY-below-200 sequence exactly once per crossing', () => {
    // $201 -> nothing, $199 -> trigger, $198/$197 -> silent, $201 -> reset, $199 -> trigger
    let current = rule();
    const actions = [];

    for (const price of [201, 199, 198, 197, 201, 199]) {
      const result = evaluateRule(current, price);
      actions.push(result.action);

      if (result.action === 'trigger') current = { ...current, triggered: true };
      if (result.action === 'reset') current = { ...current, triggered: false };
    }

    expect(actions).toEqual(['none', 'trigger', 'none', 'none', 'reset', 'trigger']);
  });

  it('does nothing for disabled rules, even when the condition is met', () => {
    expect(evaluateRule(rule({ enabled: false }), 100).action).toBe('none');
  });

  it('resets a latched rule when the price returns past the threshold', () => {
    expect(evaluateRule(rule({ triggered: true }), 205).action).toBe('reset');
  });

  it('builds a message naming the symbol, threshold and trigger price', () => {
    const { message } = evaluateRule(rule(), 199.5);
    expect(message).toContain('AAPL');
    expect(message).toContain('200.00');
    expect(message).toContain('199.50');
  });

  it('latches SELL/ABOVE rules the same way', () => {
    const sell = rule({ type: 'SELL', condition: 'ABOVE', threshold: 210 });
    expect(evaluateRule(sell, 215).action).toBe('trigger');
    expect(evaluateRule({ ...sell, triggered: true }, 216).action).toBe('none');
    expect(evaluateRule({ ...sell, triggered: true }, 209).action).toBe('reset');
  });
});
