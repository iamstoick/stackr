import { query, queryOne } from '../../db/pool.js';
import alertRuleRepository from '../../db/repositories/alertRuleRepository.js';
import favoriteRepository from '../../db/repositories/favoriteRepository.js';
import portfolioRepository from '../../db/repositories/portfolioRepository.js';

/**
 * Getting-started progress.
 *
 * Steps are *derived from what the user has actually done* rather than tracked
 * by the UI. That way progress survives a new device, cannot desync from
 * reality, and cannot be ticked off by clicking through a tour without learning
 * anything. Only the things that leave no trace — whether a lesson was read,
 * whether the checklist was dismissed — are stored.
 */

export const STEPS = [
  {
    id: 'search',
    title: 'Find a company',
    body: 'Search a name or ticker and open it. AAPL is Apple, MSFT is Microsoft.',
    action: { label: 'Search a stock', to: '/' },
    lesson: 'what-is-a-share',
  },
  {
    id: 'watch',
    title: 'Add it to your watchlist',
    body: 'Following a company means the server checks its price for you, every 5 minutes.',
    action: { label: 'Open a stock', to: '/' },
    lesson: 'reading-a-chart',
  },
  {
    id: 'alert',
    title: 'Set a price threshold',
    body: 'Pick a price worth knowing about. Stackr tells you when it is crossed instead of you watching all day.',
    action: { label: 'Set a threshold', to: '/alerts' },
    lesson: 'orders-and-alerts',
  },
  {
    id: 'trade',
    title: 'Make your first simulated trade',
    body: 'Buy something with practice money. Nothing real is at stake, and abstractions stop being abstract.',
    action: { label: 'Open the simulator', to: '/practice' },
    lesson: 'what-costs-you',
  },
  {
    id: 'review',
    title: 'Check your scorecard',
    body: 'See your result next to simply holding the index, and what costs took along the way.',
    action: { label: 'See the scorecard', to: '/practice' },
    lesson: 'why-most-lose',
  },
];

async function getProgressRow(userId) {
  return queryOne('SELECT * FROM learning_progress WHERE user_id = $1', [userId]);
}

export async function getState(userId) {
  const [row, favorites, rules, tradeCount] = await Promise.all([
    getProgressRow(userId),
    favoriteRepository.symbolsForUser(userId),
    alertRuleRepository.listByUser(userId),
    portfolioRepository.countTrades(userId),
  ]);

  // "Searched" is implied by having ever followed a symbol or traded; there is
  // no need to instrument the search box for it.
  const completed = {
    search: favorites.length > 0 || rules.length > 0 || tradeCount > 0,
    watch: favorites.length > 0,
    alert: rules.length > 0,
    trade: tradeCount > 0,
    review: tradeCount > 0 && (row?.lessons_read ?? []).includes('why-most-lose'),
  };

  const steps = STEPS.map((step) => ({ ...step, complete: Boolean(completed[step.id]) }));
  const done = steps.filter((step) => step.complete).length;

  return {
    steps,
    completedCount: done,
    totalCount: steps.length,
    finished: done === steps.length,
    dismissed: row?.tour_dismissed ?? false,
    lessonsRead: row?.lessons_read ?? [],
    nextStep: steps.find((step) => !step.complete) ?? null,
  };
}

export async function markLessonRead(userId, lessonId) {
  await query(
    `INSERT INTO learning_progress (user_id, lessons_read)
     VALUES ($1, ARRAY[$2::text])
     ON CONFLICT (user_id) DO UPDATE
       SET lessons_read = (
         SELECT ARRAY(SELECT DISTINCT unnest(learning_progress.lessons_read || ARRAY[$2::text]))
       )`,
    [userId, lessonId],
  );
  return getState(userId);
}

export async function setDismissed(userId, dismissed) {
  await query(
    `INSERT INTO learning_progress (user_id, tour_dismissed)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET tour_dismissed = EXCLUDED.tour_dismissed`,
    [userId, dismissed],
  );
  return getState(userId);
}

export default { STEPS, getState, markLessonRead, setDismissed };
