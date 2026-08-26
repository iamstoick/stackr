/**
 * Short lessons, written for someone who has never bought a share.
 *
 * Rules this content follows, deliberately:
 *   - explain mechanics, never suggest what to buy
 *   - one idea per lesson, in the order a beginner actually meets it
 *   - a concrete number wherever a concept could stay abstract
 *   - include the uncomfortable parts (costs, odds), because a guide that only
 *     sells the upside is not a guide
 */
export const LESSONS = [
  {
    id: 'what-is-a-share',
    title: 'What you are actually buying',
    minutes: 2,
    summary: 'A share is a slice of a company, not a betting slip.',
    body: [
      'A share makes you a part-owner of a real business. If a company is split into 1,000,000 shares and you own 100, you own one ten-thousandth of it — its buildings, its brand, its profits.',
      'That is why the price moves on news about the business: a company expected to earn more is worth more, so people pay more for a slice of it.',
      'The price is simply the last amount someone agreed to pay. It is not a measure of whether the company is good, and it is not a promise about tomorrow.',
    ],
    takeaway: 'You own a piece of a business. Its price is what the last buyer paid, nothing more.',
  },
  {
    id: 'reading-a-chart',
    title: 'How to read the chart',
    minutes: 3,
    summary: 'Shape is persuasive and often misleading. Read the numbers.',
    body: [
      'Time runs left to right; the line is the price at each point. Each point on a daily chart is one day’s closing price.',
      'The price scale only covers the range actually visited, so a chart can look like a cliff when the move was 1%. Always check the axis before trusting the shape.',
      'Zooming out changes the story. A stock that looks like a disaster on the 1-day view can be up over the year, and the reverse is just as common. Neither view is the truth; they answer different questions.',
    ],
    takeaway: 'Check the scale and the timeframe before you believe a shape.',
  },
  {
    id: 'orders-and-alerts',
    title: 'Orders, stops and alerts',
    minutes: 3,
    summary: 'An alert tells you. An order acts. Know which you want.',
    body: [
      'A market order buys or sells right now at whatever the price happens to be. Simple, but you do not control the price you get.',
      'A limit order says "only at this price or better". You control the price, but it may never fill.',
      'A stop order becomes an order when a price is reached — usually to limit a loss. It is not a guarantee: in a fast market the fill can be well past your stop.',
      'A Stackr threshold is the gentlest version of the same idea. It watches the price and tells you when your level is crossed, and nothing happens automatically. That makes it a good way to learn where you would have acted, without acting.',
    ],
    takeaway: 'A threshold alert is a stop that talks instead of trades.',
  },
  {
    id: 'what-costs-you',
    title: 'What a trade really costs',
    minutes: 3,
    summary: 'Commission-free is not free. The spread is the real fee.',
    body: [
      'At any moment there are two prices: what buyers will pay (the bid) and what sellers want (the ask). You buy at the ask and sell at the bid, and the gap between them — the spread — is a cost you pay without ever seeing a line item.',
      'On a heavily traded large company the spread might be 0.02%. On a thin, jumpy one it can be 0.5% or worse. You pay it twice per round trip: once getting in, once getting out.',
      'That is why the simulator charges it. Buy and immediately sell in Stackr and you will end up with slightly less money than you started with, even though the price never moved. That is not a bug — it is the most useful thing the simulator can show you.',
      'Every trade therefore starts underwater. The price has to move in your favour just to get back to zero.',
    ],
    takeaway: 'Every round trip pays the spread twice. Trading more means paying more.',
  },
  {
    id: 'volatility',
    title: 'How much things move',
    minutes: 2,
    summary: 'Most beginners underestimate normal movement, badly.',
    body: [
      'A large, stable company might move about 1% on an ordinary day. A speculative one can move 5–10% before lunch, with no news at all.',
      'That matters because a normal day should not feel like an emergency. If a 6% drop would panic you, a stock that moves 6% routinely is the wrong size position for you — not necessarily the wrong stock.',
      'Stackr shows each stock’s typical daily move next to what it means in dollars for the amount you are considering. That second number is the one that tells you whether you can live with it.',
    ],
    takeaway: 'Size the position to a move you can sit through without flinching.',
  },
  {
    id: 'diversification',
    title: 'Why one stock is risky',
    minutes: 2,
    summary: 'A single company can go to zero. A whole market rarely does.',
    body: [
      'Individual companies fail — through fraud, obsolescence, debt, or plain bad luck. If your money is in one of them, its bad day is your whole portfolio’s bad day.',
      'Spreading across many companies means no single failure ruins you. An index fund does this in one purchase: buying the S&P 500 makes you a part-owner of 500 businesses at once.',
      'This is why "how much is in my biggest holding?" is a more important question than "which stock should I buy?".',
    ],
    takeaway: 'Concentration is the fastest way to a permanent loss.',
  },
  {
    id: 'why-most-lose',
    title: 'The odds, honestly',
    minutes: 3,
    summary: 'Most active traders underperform simply holding an index.',
    body: [
      'This is one of the most consistent findings in finance: across markets and decades, the majority of active retail traders earn less than they would have by buying a broad index fund and leaving it alone. The more they trade, the wider the gap.',
      'Two things cause it. Costs, which compound with every trade. And timing — people tend to buy after something has risen and sell after it has fallen, which is the wrong order.',
      'None of this means markets are a scam or that you should not learn how they work. It means the default plan for most people is a boring one, and that any strategy should be measured against it rather than against zero.',
      'Your scorecard in Stackr does exactly that: it puts your simulated result next to holding the index over the same period. Do not be discouraged by being behind — noticing it is the whole point of practising with fake money.',
    ],
    takeaway: 'Measure yourself against buy-and-hold, not against zero.',
  },
  {
    id: 'market-hours',
    title: 'When the market is open',
    minutes: 2,
    summary: 'US stocks trade 09:30–16:00 New York time, weekdays only.',
    body: [
      'Outside those hours the price you see is the last trade of the regular session. It is not live, and an order placed then queues until the next open — where it can fill at a very different price.',
      'There is limited trading before and after the bell, but far fewer participants, so prices there can be unreliable.',
      'The market also closes on around nine holidays a year, and closes early on a few afternoons. Stackr knows the calendar and tells you what is happening rather than showing a stale number as though it were current.',
      'Crypto is different: it trades every hour of every day, which is one reason it feels more volatile to watch.',
    ],
    takeaway: 'A price outside market hours is history, not a quote.',
  },
];

export const LESSON_BY_ID = Object.fromEntries(LESSONS.map((lesson) => [lesson.id, lesson]));

export default LESSONS;
