/**
 * US equity market calendar.
 *
 * Sessions are derived from the exchange's own wall clock via the IANA zone
 * rather than a fixed UTC offset, so EST/EDT is handled by the platform instead
 * of by arithmetic that is wrong for half the year. Holidays and early closes
 * are computed per year, so the calendar does not expire.
 */

const EXCHANGE_TIMEZONE = 'America/New_York';

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: EXCHANGE_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  weekday: 'short',
});

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Session boundaries in minutes from midnight, exchange local time.
const PRE_OPEN = 4 * 60; // 04:00
const REGULAR_OPEN = 9 * 60 + 30; // 09:30
const REGULAR_CLOSE = 16 * 60; // 16:00
const EARLY_CLOSE = 13 * 60; // 13:00
const POST_CLOSE = 20 * 60; // 20:00
const EARLY_POST_CLOSE = 17 * 60; // 17:00 on a half day

/** Exchange-local calendar and clock fields for an instant. */
export function exchangeParts(date = new Date()) {
  const parts = {};
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }

  // Some ICU versions render midnight as hour 24.
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAY_INDEX[parts.weekday],
    hour,
    minute,
    minutes: hour * 60 + minute,
  };
}

const iso = (year, month, day) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** Day of week for a calendar date, without timezone involvement. */
const weekdayOf = (year, month, day) => new Date(Date.UTC(year, month - 1, day)).getUTCDay();

/** Nth given weekday of a month, e.g. the 3rd Monday of January. */
function nthWeekday(year, month, weekday, n) {
  const first = weekdayOf(year, month, 1);
  const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  return iso(year, month, day);
}

function lastWeekday(year, month, weekday) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = weekdayOf(year, month, daysInMonth);
  return iso(year, month, daysInMonth - ((last - weekday + 7) % 7));
}

/** Anonymous Gregorian algorithm; Good Friday is Easter minus two days. */
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function goodFriday(year) {
  const easter = easterSunday(year);
  const date = new Date(Date.UTC(easter.year, easter.month - 1, easter.day - 2));
  return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * NYSE observance: a Saturday holiday closes the preceding Friday and a Sunday
 * holiday closes the following Monday. New Year's Day is the exception — when it
 * falls on a Saturday the exchange does not close the Friday before.
 */
function observed(year, month, day, { skipSaturday = false } = {}) {
  const weekday = weekdayOf(year, month, day);
  if (weekday === 6) {
    if (skipSaturday) return null;
    const shifted = new Date(Date.UTC(year, month - 1, day - 1));
    return iso(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
  }
  if (weekday === 0) {
    const shifted = new Date(Date.UTC(year, month - 1, day + 1));
    return iso(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
  }
  return iso(year, month, day);
}

const yearCache = new Map();

function calendarFor(year) {
  if (yearCache.has(year)) return yearCache.get(year);

  const holidays = new Map();
  const add = (date, name) => {
    if (date) holidays.set(date, name);
  };

  add(observed(year, 1, 1, { skipSaturday: true }), "New Year's Day");
  add(nthWeekday(year, 1, 1, 3), 'Martin Luther King, Jr. Day');
  add(nthWeekday(year, 2, 1, 3), "Washington's Birthday");
  add(goodFriday(year), 'Good Friday');
  add(lastWeekday(year, 5, 1), 'Memorial Day');
  add(observed(year, 6, 19), 'Juneteenth');
  add(observed(year, 7, 4), 'Independence Day');
  add(nthWeekday(year, 9, 1, 1), 'Labor Day');
  add(nthWeekday(year, 11, 4, 4), 'Thanksgiving Day');
  add(observed(year, 12, 25), 'Christmas Day');

  // Half days: 13:00 close. Each applies only when it is itself a weekday and
  // the adjacent full holiday is not shifted onto it.
  const earlyCloses = new Map();
  const addEarly = (date, name) => {
    if (!date) return;
    const [y, m, d] = date.split('-').map(Number);
    const weekday = weekdayOf(y, m, d);
    if (weekday === 0 || weekday === 6) return;
    if (holidays.has(date)) return;
    earlyCloses.set(date, name);
  };

  addEarly(iso(year, 7, 3), 'Independence Day eve');
  const thanksgiving = nthWeekday(year, 11, 4, 4).split('-').map(Number);
  const dayAfter = new Date(Date.UTC(thanksgiving[0], thanksgiving[1] - 1, thanksgiving[2] + 1));
  addEarly(
    iso(dayAfter.getUTCFullYear(), dayAfter.getUTCMonth() + 1, dayAfter.getUTCDate()),
    'Day after Thanksgiving',
  );
  addEarly(iso(year, 12, 24), 'Christmas Eve');

  const calendar = { holidays, earlyCloses };
  yearCache.set(year, calendar);
  return calendar;
}

export function holidayName(dateString) {
  const year = Number(dateString.slice(0, 4));
  return calendarFor(year).holidays.get(dateString) ?? null;
}

export function earlyCloseName(dateString) {
  const year = Number(dateString.slice(0, 4));
  return calendarFor(year).earlyCloses.get(dateString) ?? null;
}

export const SESSION_LABELS = {
  open: 'Market open',
  pre: 'Pre-market',
  post: 'After hours',
  closed: 'Market closed',
  holiday: 'Market holiday',
  weekend: 'Weekend',
};

/**
 * Which session the exchange is in.
 *
 * @returns {{
 *   session: 'open'|'pre'|'post'|'closed'|'holiday'|'weekend',
 *   isTradingDay: boolean, isRegularSession: boolean, isExtendedHours: boolean,
 *   holiday: string|null, earlyClose: string|null,
 *   exchangeDate: string, exchangeTime: string, timezone: string,
 * }}
 */
export function marketSession(date = new Date()) {
  const parts = exchangeParts(date);
  const exchangeTime = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
  const base = {
    holiday: null,
    earlyClose: null,
    exchangeDate: parts.date,
    exchangeTime,
    timezone: EXCHANGE_TIMEZONE,
  };

  if (parts.weekday === 0 || parts.weekday === 6) {
    return {
      ...base,
      session: 'weekend',
      isTradingDay: false,
      isRegularSession: false,
      isExtendedHours: false,
    };
  }

  const holiday = holidayName(parts.date);
  if (holiday) {
    return {
      ...base,
      holiday,
      session: 'holiday',
      isTradingDay: false,
      isRegularSession: false,
      isExtendedHours: false,
    };
  }

  const earlyClose = earlyCloseName(parts.date);
  const regularClose = earlyClose ? EARLY_CLOSE : REGULAR_CLOSE;
  const postClose = earlyClose ? EARLY_POST_CLOSE : POST_CLOSE;

  let session = 'closed';
  if (parts.minutes >= REGULAR_OPEN && parts.minutes < regularClose) session = 'open';
  else if (parts.minutes >= PRE_OPEN && parts.minutes < REGULAR_OPEN) session = 'pre';
  else if (parts.minutes >= regularClose && parts.minutes < postClose) session = 'post';

  return {
    ...base,
    earlyClose,
    session,
    isTradingDay: true,
    isRegularSession: session === 'open',
    isExtendedHours: session === 'pre' || session === 'post',
  };
}

/** True when quotes can move: regular hours or extended hours. */
export function isMarketActive(date = new Date()) {
  const { session } = marketSession(date);
  return session === 'open' || session === 'pre' || session === 'post';
}

/** The exchange-local date, used to detect a session rollover between polls. */
export function exchangeDate(date = new Date()) {
  return exchangeParts(date).date;
}

/** Minutes the exchange clock is offset from UTC at a given instant. */
function exchangeOffsetMinutes(date) {
  const parts = exchangeParts(date);
  const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return (asIfUtc - date.getTime()) / 60_000;
}

/**
 * Converts an exchange-local wall-clock time to a real instant.
 *
 * Done by measuring the zone's offset at an approximate instant and correcting,
 * twice, so a time that lands near a DST transition still resolves correctly.
 */
function exchangeTimeToInstant(dateString, minutesFromMidnight) {
  const [year, month, day] = dateString.split('-').map(Number);
  const naive = Date.UTC(year, month - 1, day, Math.floor(minutesFromMidnight / 60), minutesFromMidnight % 60);

  let instant = new Date(naive - exchangeOffsetMinutes(new Date(naive)) * 60_000);
  instant = new Date(naive - exchangeOffsetMinutes(instant) * 60_000);
  return instant;
}

const addDays = (dateString, days) => {
  const [year, month, day] = dateString.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return iso(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
};

function isTradingDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const weekday = weekdayOf(year, month, day);
  return weekday !== 0 && weekday !== 6 && !holidayName(dateString);
}

/**
 * When the regular session next opens, and how long until then.
 *
 * Beginners routinely do not know the market is shut — a countdown says it
 * plainly instead of leaving them to infer it from a price that will not move.
 */
export function nextMarketOpen(date = new Date()) {
  const parts = exchangeParts(date);

  let candidate = parts.date;
  if (!isTradingDate(candidate) || parts.minutes >= REGULAR_OPEN) {
    do {
      candidate = addDays(candidate, 1);
    } while (!isTradingDate(candidate));
  }

  const at = exchangeTimeToInstant(candidate, REGULAR_OPEN);
  return { at: at.toISOString(), date: candidate, msUntil: Math.max(0, at.getTime() - date.getTime()) };
}

/** When the current regular session closes, if one is open. */
export function nextMarketClose(date = new Date()) {
  const session = marketSession(date);
  if (!session.isTradingDay) return null;

  const parts = exchangeParts(date);
  const closeMinutes = session.earlyClose ? EARLY_CLOSE : REGULAR_CLOSE;
  if (parts.minutes >= closeMinutes) return null;

  const at = exchangeTimeToInstant(parts.date, closeMinutes);
  return { at: at.toISOString(), msUntil: Math.max(0, at.getTime() - date.getTime()) };
}

export default {
  marketSession,
  isMarketActive,
  nextMarketOpen,
  nextMarketClose,
  exchangeDate,
  exchangeParts,
  holidayName,
  earlyCloseName,
  SESSION_LABELS,
  EXCHANGE_TIMEZONE,
};
