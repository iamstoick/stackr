import cron from 'node-cron';

import config from '../config/env.js';
import notificationService from '../services/notifications/notificationService.js';
import logger from '../utils/logger.js';
import { runPollCycle } from './poller.js';

const tasks = [];

/** Wraps a job so a thrown error never kills the schedule. */
function schedule(name, expression, handler) {
  if (!cron.validate(expression)) {
    logger.error({ job: name, cron: expression }, 'Invalid cron expression; job not started');
    return null;
  }

  const task = cron.schedule(
    expression,
    async () => {
      try {
        await handler();
      } catch (err) {
        logger.error({ err, job: name }, 'Scheduled job failed');
      }
    },
    { timezone: 'UTC' },
  );

  tasks.push({ name, task });
  logger.info({ job: name, cron: expression }, 'Scheduled job started');
  return task;
}

/**
 * Starts the background jobs. One schedule serves every user and every alert —
 * never one job per user or per alert.
 */
export function startScheduler() {
  if (tasks.length > 0) return tasks;

  if (!config.poller.enabled) {
    logger.warn('Poller disabled (POLL_ENABLED=false)');
  } else if (!config.features.finnhub) {
    logger.warn('Poller not started: FINNHUB_API_KEY is not configured');
  } else {
    schedule('poller', config.poller.cron, runPollCycle);
  }

  // The dispatcher runs separately from the poller: a slow or failing webhook
  // must not delay the next price check, and a retry must not re-poll.
  if (config.notifications.enabled) {
    schedule('notifications', config.notifications.cron, notificationService.dispatchPending);
  } else {
    logger.warn('Notification dispatcher disabled (NOTIFY_ENABLED=false)');
  }

  return tasks;
}

export async function stopScheduler() {
  while (tasks.length > 0) {
    const { name, task } = tasks.pop();
    await task.stop();
    logger.info({ job: name }, 'Scheduled job stopped');
  }
}

export default { startScheduler, stopScheduler };
