import config from '../../config/env.js';
import notificationRepository from '../../db/repositories/notificationRepository.js';
import logger from '../../utils/logger.js';
import { CHANNELS } from './channels.js';

/**
 * Turns stored alerts into delivered ones.
 *
 * Deliveries are rows, not fire-and-forget calls: enqueue happens in the same
 * transaction as the alert, so an alert can never exist without its delivery
 * intent, and a crashed or rate-limited send is retried instead of lost.
 */

/**
 * Is the local wall-clock hour inside the user's quiet window? Quiet hours are a
 * wall-clock statement ("not at 3am"), so they are evaluated in the user's own
 * timezone and may wrap past midnight.
 */
export function isQuietHour(settings, now = new Date()) {
  const { quietHoursStart: start, quietHoursEnd: end } = settings ?? {};
  if (start === null || start === undefined || end === null || end === undefined) return false;
  if (start === end) return false;

  let hour;
  try {
    hour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: settings.timezone || 'UTC',
        hour: '2-digit',
        hour12: false,
      }).format(now),
    ) % 24;
  } catch {
    hour = now.getUTCHours();
  }

  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * Queues every channel the user has switched on. Called inside the alert's own
 * transaction, so the client is passed through.
 */
export async function enqueueForAlert(alert, settings, client) {
  if (!config.notifications.enabled) return [];

  const queued = [];
  for (const channel of CHANNELS) {
    if (!channel.enabledFor(settings)) continue;

    // Recorded as skipped rather than dropped, so the history explains itself
    // when a channel is switched on but not usable.
    const status = channel.available() ? 'pending' : 'skipped';
    const delivery = await notificationRepository.enqueue(
      { alertId: alert.id, userId: alert.userId, channel: channel.name, status },
      client,
    );
    if (delivery) queued.push(delivery);
  }
  return queued;
}

/** Sends one claimed delivery. Never throws; the outcome is recorded. */
async function deliver(item) {
  const channel = CHANNELS.find((c) => c.name === item.channel);

  if (!channel) {
    await notificationRepository.markSkipped(item.id, `unknown channel ${item.channel}`);
    return 'skipped';
  }
  if (!channel.available()) {
    await notificationRepository.markSkipped(item.id, `${item.channel} is not configured`);
    return 'skipped';
  }
  if (!channel.enabledFor(item.settings)) {
    await notificationRepository.markSkipped(item.id, `${item.channel} disabled by the user`);
    return 'skipped';
  }
  // System notices are the ones a user most needs at any hour, but a price alert
  // during quiet hours is held rather than dropped: it stays pending and goes
  // out when the window ends.
  if (item.alert.kind !== 'SYSTEM' && isQuietHour(item.settings)) {
    logger.debug({ deliveryId: item.id }, 'Holding delivery during quiet hours');
    return 'held';
  }

  try {
    await channel.send(item);
    await notificationRepository.markSent(item.id);
    logger.info(
      { deliveryId: item.id, channel: item.channel, symbol: item.alert.symbol, userId: item.userId },
      'Alert delivered',
    );
    return 'sent';
  } catch (err) {
    // Message only: a provider error can carry the webhook URL or auth headers.
    await notificationRepository.markFailed(item.id, err.message, config.notifications.maxAttempts);
    logger.warn(
      { deliveryId: item.id, channel: item.channel, attempts: item.attempts, err: err.message },
      'Alert delivery failed',
    );
    return 'failed';
  }
}

const status = {
  running: false,
  runs: 0,
  lastRunAt: null,
  lastSent: 0,
  lastFailed: 0,
  lastSkipped: 0,
  lastHeld: 0,
  totalSent: 0,
};

export function getDispatcherStatus() {
  return { ...status, enabled: config.notifications.enabled, cron: config.notifications.cron };
}

/** Drains a batch of pending deliveries. Safe to run in several containers. */
export async function dispatchPending() {
  if (!config.notifications.enabled) return { skipped: true };
  if (status.running) return { skipped: true, reason: 'overlap' };

  status.running = true;
  try {
    const batch = await notificationRepository.claimPending(
      config.notifications.batchSize,
      config.notifications.maxAttempts,
    );
    if (batch.length === 0) return { delivered: 0, failed: 0, skipped: 0, held: 0 };

    const outcomes = await Promise.all(batch.map((item) => deliver(item)));
    const count = (name) => outcomes.filter((o) => o === name).length;

    status.runs += 1;
    status.lastRunAt = new Date().toISOString();
    status.lastSent = count('sent');
    status.lastFailed = count('failed');
    status.lastSkipped = count('skipped');
    status.lastHeld = count('held');
    status.totalSent += status.lastSent;

    logger.info(
      { sent: status.lastSent, failed: status.lastFailed, skipped: status.lastSkipped, held: status.lastHeld },
      'Notification batch dispatched',
    );

    return {
      delivered: status.lastSent,
      failed: status.lastFailed,
      skipped: status.lastSkipped,
      held: status.lastHeld,
    };
  } finally {
    status.running = false;
  }
}

export async function getSettings(userId) {
  const settings = await notificationRepository.getSettings(userId);
  return {
    ...settings,
    channels: {
      email: { available: config.features.emailNotifications, enabled: settings.emailEnabled },
      webhook: { available: true, enabled: settings.webhookEnabled },
    },
  };
}

export async function updateSettings(userId, patch) {
  await notificationRepository.upsertSettings(userId, patch);
  return getSettings(userId);
}

export default {
  isQuietHour,
  enqueueForAlert,
  dispatchPending,
  getDispatcherStatus,
  getSettings,
  updateSettings,
};
