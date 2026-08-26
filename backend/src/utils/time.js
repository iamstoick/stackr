/** Unix epoch seconds (Finnhub's timestamp unit). */
export function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export function secondsToDate(seconds) {
  return new Date(seconds * 1000);
}

export function daysToSeconds(days) {
  return Math.round(days * 24 * 60 * 60);
}

// Market sessions live in services/market/marketCalendar.js, which uses the
// exchange's own timezone and holiday calendar rather than fixed UTC offsets.

export default { nowSeconds, secondsToDate, daysToSeconds };
