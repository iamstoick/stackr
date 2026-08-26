import notificationRepository from '../db/repositories/notificationRepository.js';
import notificationService from '../services/notifications/notificationService.js';
import { assertSafeWebhookUrl } from '../services/notifications/webhookUrl.js';
import asyncHandler from '../utils/asyncHandler.js';

/** GET /api/user/notifications */
export const getSettings = asyncHandler(async (req, res) => {
  const [settings, deliveries] = await Promise.all([
    notificationService.getSettings(req.user.id),
    notificationRepository.statsForUser(req.user.id),
  ]);
  res.json({ settings, deliveries });
});

/** PUT /api/user/notifications */
export const updateSettings = asyncHandler(async (req, res) => {
  const patch = { ...req.body };

  // Validated here as well as at send time, so a bad URL is rejected while the
  // user is looking at the form rather than failing silently later.
  if (patch.webhookUrl) patch.webhookUrl = assertSafeWebhookUrl(patch.webhookUrl);
  else patch.webhookUrl = null;

  if (!patch.webhookUrl) patch.webhookEnabled = false;

  const settings = await notificationService.updateSettings(req.user.id, patch);
  res.json({ settings });
});

export default { getSettings, updateSettings };
