import { describe, expect, it } from 'vitest';

import {
  buildNotice,
  detectCorporateAction,
} from '../src/services/market/corporateActionGuard.js';

const stored = (price) => ({ price });

describe('detectCorporateAction', () => {
  it('detects a 4-for-1 split', () => {
    // We stored $800; the provider now says the previous close was $200.
    const detection = detectCorporateAction(stored(800), { previousClose: 200, price: 201 });
    expect(detection).toMatchObject({ ratio: 4, reason: 'suspected 4-for-1 split' });
  });

  it('detects a 1-for-10 reverse split', () => {
    const detection = detectCorporateAction(stored(2), { previousClose: 20, price: 19.5 });
    expect(detection.reason).toBe('suspected 1-for-10 reverse split');
  });

  it('detects a 3-for-2 split', () => {
    const detection = detectCorporateAction(stored(150), { previousClose: 100, price: 101 });
    expect(detection.reason).toBe('suspected 1.5-for-1 split');
  });

  it('names an unrecognised re-basing without guessing a ratio', () => {
    const detection = detectCorporateAction(stored(100), { previousClose: 61, price: 62 });
    expect(detection.reason).toBe('price series was re-based by the data provider');
  });

  it('ignores an ordinary session-to-session move', () => {
    expect(detectCorporateAction(stored(201), { previousClose: 202, price: 205 })).toBe(null);
  });

  it('ignores a genuine overnight gap, which leaves the previous close intact', () => {
    // Earnings gap: we stored $200, the provider still says the prior close was
    // $200, and the stock now opens at $150. That is news, not a split.
    expect(detectCorporateAction(stored(200), { previousClose: 200, price: 150 })).toBe(null);
  });

  it('ignores a large but real intraday move', () => {
    expect(detectCorporateAction(stored(100), { previousClose: 98, price: 140 })).toBe(null);
  });

  it('stays quiet without both reference prices', () => {
    expect(detectCorporateAction(null, { previousClose: 200 })).toBe(null);
    expect(detectCorporateAction(stored(null), { previousClose: 200 })).toBe(null);
    expect(detectCorporateAction(stored(800), { previousClose: null })).toBe(null);
    expect(detectCorporateAction(stored(0), { previousClose: 200 })).toBe(null);
  });

  it('tolerates a small dividend adjustment without suspending anything', () => {
    // A 2% ex-dividend adjustment must not pause a user's alerts.
    expect(detectCorporateAction(stored(100), { previousClose: 98.2, price: 98.5 })).toBe(null);
  });
});

describe('buildNotice', () => {
  it('explains what happened and what to do about it', () => {
    const detection = detectCorporateAction(stored(800), { previousClose: 200, price: 201 });
    const notice = buildNotice('AAPL', detection);

    expect(notice).toContain('AAPL');
    expect(notice).toContain('4-for-1 split');
    expect(notice).toContain('$800.00');
    expect(notice).toContain('$200.00');
    expect(notice).toMatch(/resume/i);
  });
});
