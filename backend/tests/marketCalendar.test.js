import { describe, expect, it } from 'vitest';

import {
  earlyCloseName,
  exchangeDate,
  holidayName,
  isMarketActive,
  marketSession,
} from '../src/services/market/marketCalendar.js';

// 09:30 ET is 13:30 UTC in summer (EDT) and 14:30 UTC in winter (EST). These
// tests pin both, because a fixed UTC offset is wrong for half the year.
const utc = (iso) => new Date(iso);

describe('marketSession — daylight saving', () => {
  it('opens at 13:30 UTC in summer (EDT)', () => {
    expect(marketSession(utc('2026-07-15T13:29:00Z')).session).toBe('pre');
    expect(marketSession(utc('2026-07-15T13:30:00Z')).session).toBe('open');
    expect(marketSession(utc('2026-07-15T19:59:00Z')).session).toBe('open');
    expect(marketSession(utc('2026-07-15T20:00:00Z')).session).toBe('post');
  });

  it('opens at 14:30 UTC in winter (EST)', () => {
    expect(marketSession(utc('2026-01-14T14:29:00Z')).session).toBe('pre');
    expect(marketSession(utc('2026-01-14T14:30:00Z')).session).toBe('open');
    expect(marketSession(utc('2026-01-14T20:59:00Z')).session).toBe('open');
    expect(marketSession(utc('2026-01-14T21:00:00Z')).session).toBe('post');
  });

  it('does not call the first hour of a winter session pre-market', () => {
    // The bug this replaces: 13:30-20:00 UTC hardcoded, so 14:30 UTC in January
    // (09:30 ET, the opening bell) was reported as already open an hour early.
    const winterOpen = marketSession(utc('2026-01-14T13:45:00Z'));
    expect(winterOpen.session).toBe('pre');
    expect(winterOpen.isRegularSession).toBe(false);
  });

  it('reports the exchange wall clock rather than the server clock', () => {
    const session = marketSession(utc('2026-07-15T13:30:00Z'));
    expect(session.exchangeTime).toBe('09:30');
    expect(session.timezone).toBe('America/New_York');
  });
});

describe('marketSession — non-trading days', () => {
  it('treats weekends as non-trading', () => {
    expect(marketSession(utc('2026-08-22T15:00:00Z')).session).toBe('weekend'); // Saturday
    expect(marketSession(utc('2026-08-23T15:00:00Z')).isTradingDay).toBe(false); // Sunday
  });

  it('knows the fixed-date holidays', () => {
    expect(holidayName('2026-01-01')).toBe("New Year's Day");
    expect(holidayName('2026-06-19')).toBe('Juneteenth');
    expect(holidayName('2026-12-25')).toBe('Christmas Day');
  });

  it('knows the floating holidays', () => {
    expect(holidayName('2026-01-19')).toBe('Martin Luther King, Jr. Day'); // 3rd Mon Jan
    expect(holidayName('2026-02-16')).toBe("Washington's Birthday"); // 3rd Mon Feb
    expect(holidayName('2026-05-25')).toBe('Memorial Day'); // last Mon May
    expect(holidayName('2026-09-07')).toBe('Labor Day'); // 1st Mon Sep
    expect(holidayName('2026-11-26')).toBe('Thanksgiving Day'); // 4th Thu Nov
  });

  it('computes Good Friday from Easter', () => {
    expect(holidayName('2026-04-03')).toBe('Good Friday'); // Easter 2026-04-05
    expect(holidayName('2027-03-26')).toBe('Good Friday'); // Easter 2027-03-28
  });

  it('shifts a Sunday holiday to the Monday after', () => {
    // 2027-12-25 is a Saturday -> observed Friday 24th.
    expect(holidayName('2027-12-24')).toBe('Christmas Day');
    // 2028-12-25 is a Monday, no shift.
    expect(holidayName('2028-12-25')).toBe('Christmas Day');
  });

  it('does not close the Friday before a Saturday New Year', () => {
    // 2028-01-01 is a Saturday: the exchange stays open on 2027-12-31.
    expect(holidayName('2027-12-31')).toBe(null);
  });

  it('reports Thanksgiving as a holiday rather than an open session', () => {
    const session = marketSession(utc('2026-11-26T16:00:00Z'));
    expect(session.session).toBe('holiday');
    expect(session.holiday).toBe('Thanksgiving Day');
    expect(session.isTradingDay).toBe(false);
  });
});

describe('marketSession — early closes', () => {
  it('knows the half days', () => {
    expect(earlyCloseName('2026-11-27')).toBe('Day after Thanksgiving');
    expect(earlyCloseName('2026-12-24')).toBe('Christmas Eve');
    // 2028-07-04 is a Tuesday, so the Monday before is a half day.
    expect(earlyCloseName('2028-07-03')).toBe('Independence Day eve');
  });

  it('prefers the full holiday when an observance lands on a would-be half day', () => {
    // 2026-07-04 is a Saturday, so the exchange closes Friday the 3rd outright
    // rather than trading a half day.
    expect(holidayName('2026-07-03')).toBe('Independence Day');
    expect(earlyCloseName('2026-07-03')).toBe(null);
  });

  it('closes the regular session at 13:00 ET on a half day', () => {
    // 2026-11-27, EST: 13:00 ET = 18:00 UTC.
    expect(marketSession(utc('2026-11-27T17:59:00Z')).session).toBe('open');
    expect(marketSession(utc('2026-11-27T18:00:00Z')).session).toBe('post');
    expect(marketSession(utc('2026-11-27T18:00:00Z')).earlyClose).toBe('Day after Thanksgiving');
  });

  it('ignores an early close that lands on a weekend', () => {
    // 2027-12-24 is a Friday but is the observed Christmas holiday, not a half day.
    expect(earlyCloseName('2027-12-24')).toBe(null);
  });
});

describe('helpers', () => {
  it('reports the exchange-local date, which differs from UTC late in the day', () => {
    expect(exchangeDate(utc('2026-08-22T01:30:00Z'))).toBe('2026-08-21');
    expect(exchangeDate(utc('2026-08-21T18:00:00Z'))).toBe('2026-08-21');
  });

  it('treats extended hours as active but a closed market as not', () => {
    expect(isMarketActive(utc('2026-07-15T11:00:00Z'))).toBe(true); // 07:00 ET, pre
    expect(isMarketActive(utc('2026-07-15T17:00:00Z'))).toBe(true); // 13:00 ET, open
    expect(isMarketActive(utc('2026-07-15T23:00:00Z'))).toBe(true); // 19:00 ET, post
    expect(isMarketActive(utc('2026-07-15T05:00:00Z'))).toBe(false); // 01:00 ET
    expect(isMarketActive(utc('2026-11-26T16:00:00Z'))).toBe(false); // Thanksgiving
  });
});
