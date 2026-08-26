import axios from 'axios';
import nodemailer from 'nodemailer';

import config from '../../config/env.js';
import logger from '../../utils/logger.js';
import { formatAlertText, renderEmail } from './templates.js';
import { assertSafeWebhookUrl } from './webhookUrl.js';

let transporter = null;

/** Lazily built so a missing SMTP_URL disables email rather than crashing boot. */
function mailTransport() {
  if (!config.features.emailNotifications) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport(config.notifications.smtpUrl, {
      from: config.notifications.mailFrom,
    });
    logger.info('SMTP transport configured for alert email');
  }
  return transporter;
}

export const emailChannel = {
  name: 'email',
  available: () => config.features.emailNotifications,
  enabledFor: (settings) => settings.emailEnabled !== false,
  async send({ alert, recipient }) {
    const transport = mailTransport();
    if (!transport) throw new Error('SMTP is not configured');
    if (!recipient?.email) throw new Error('User has no email address');

    const { subject, text, html } = renderEmail(alert, recipient);
    await transport.sendMail({
      from: config.notifications.mailFrom,
      to: recipient.email,
      subject,
      text,
      html,
    });
  },
};

/**
 * Generic JSON webhook. The payload carries both a ready-made `text` field
 * (which Slack and Discord render directly) and the structured alert, so one
 * channel covers most destinations without per-service code.
 */
export const webhookChannel = {
  name: 'webhook',
  available: () => true,
  enabledFor: (settings) => Boolean(settings.webhookEnabled && settings.webhookUrl),
  async send({ alert, settings }) {
    const url = settings.webhookUrl;
    if (!url) throw new Error('No webhook URL configured');
    // Re-checked at send time, not just at save time: the row could predate the
    // validation rules or have been written by an older version.
    assertSafeWebhookUrl(url);

    await axios.post(
      url,
      {
        text: formatAlertText(alert),
        content: formatAlertText(alert), // Discord uses `content`
        alert: {
          id: alert.id,
          kind: alert.kind,
          symbol: alert.symbol,
          type: alert.type,
          condition: alert.condition,
          triggerPrice: alert.triggerPrice,
          threshold: alert.threshold,
          message: alert.message,
          triggeredAt: alert.triggeredAt,
        },
        source: 'stackr',
      },
      {
        timeout: 8_000,
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Stackr/1.0' },
        // A redirect could send the payload to a host that never passed
        // validation, so redirects are not followed. Non-2xx throws, which
        // leaves the delivery pending for another attempt.
        maxRedirects: 0,
      },
    );
  },
};

export const CHANNELS = [emailChannel, webhookChannel];

export default { CHANNELS, emailChannel, webhookChannel };
