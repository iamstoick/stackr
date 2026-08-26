/**
 * Plain-language explanations for the things a chart or table shows.
 *
 * Written for someone who has not traded before: each entry says what the thing
 * is, then gives a concrete example, and avoids defining a term with other
 * jargon. Keep them to two or three short sentences — a tooltip nobody finishes
 * reading explains nothing.
 */
export const GLOSSARY = {
  symbol: {
    title: 'Symbol',
    body: 'The short code an exchange uses for one company. Apple is AAPL, Microsoft is MSFT. You can search by either the code or the company name.',
  },
  company: {
    title: 'Company',
    body: 'The full name behind the symbol, so you can tell similar codes apart — APLE is Apple Hospitality REIT, not Apple Inc.',
  },
  price: {
    title: 'Price',
    body: 'What one share last traded at. It is the price someone actually paid, not an offer, so it only changes when a trade happens.',
  },
  changeToday: {
    title: 'Today',
    body: 'How far the price has moved since the previous session closed, as a percentage. +2% means one share costs 2% more than it did at yesterday’s close. Green is up, red is down.',
  },
  changeAmount: {
    title: 'Change',
    body: 'The same move as the percentage, but in dollars per share. A $1.25 drop on a $200 share is the same thing as −0.62%.',
  },
  dayRange: {
    title: 'Day range',
    body: 'The lowest and highest price traded so far in the session, and where the last trade sits between them. Near 100% means it is holding close to the day’s high; near 0% means it is closing in on the low.',
    note: 'Two stocks can both be up 2% while one sits at its high and the other has faded from it.',
  },
  priceLine: {
    title: 'Price line',
    body: 'Each point is the closing price for one slice of time. The shaded area underneath is only there to make the direction easier to read at a glance.',
  },
  thresholdLine: {
    title: 'Your threshold',
    body: 'A dashed amber line marks a price you asked to be told about. When the price crosses it, Stackr creates an alert. Faded lines are paused rules.',
  },
  lastPriceLine: {
    title: 'Last price',
    body: 'The dotted line is the most recent price. The bars and the live price come from different data sources, so this shows where "now" sits against the history.',
  },
  timeAxis: {
    title: 'Time',
    body: 'Time runs left to right, oldest to newest, shown in your own timezone. The labels change with the timeframe you pick.',
  },
  priceAxis: {
    title: 'Price scale',
    body: 'The price ladder on the right. It only spans the range actually visited in this window, so a small wiggle can look dramatic — check the numbers before the shape.',
  },
  ohlc: {
    title: 'Open, high, low, close',
    body: 'The four prices that summarise one bar: where it started, the most and least it fetched, and where it ended. A bar with a low far below its close means the price dipped and recovered inside that period.',
  },
  volume: {
    title: 'Volume',
    body: 'How many shares changed hands during that bar. A big move on unusually low volume means few people were involved, so it is weaker evidence than the same move on heavy volume.',
  },
  timeframe: {
    title: 'Timeframe',
    body: '1m and 1h show recent detail — one bar per minute or hour. 1D, 1W, 1M and 1Y zoom out, each bar covering a day, week or month, so you see the longer trend instead of the noise.',
  },
  thresholdGauge: {
    title: 'Distance to your threshold',
    body: 'The amber tick is your threshold and the white dot is the current price. The side the dot sits on tells you whether the rule is currently satisfied, without reading any numbers.',
  },
  marketSession: {
    title: 'Market session',
    body: 'US exchanges trade 09:30–16:00 New York time on weekdays. Outside that, prices barely move and the number you see is the last trade of the regular session.',
  },
  delayed: {
    title: 'Delayed',
    body: 'This price is not current — either the data plan delays it, or it is the last one Stackr managed to store. Do not treat it as what you could trade at right now.',
  },
  alertCount: {
    title: 'Armed alerts',
    body: 'How many of your thresholds are currently watching this symbol. Paused and expired rules are not counted.',
  },
  trailing: {
    title: 'Trailing threshold',
    body: 'Instead of a fixed price, the level follows the stock. A 10% trailing sell tracks the highest price since you set it and alerts you 10% below that high — the level rises with the stock and never falls back.',
  },
};

export default GLOSSARY;
