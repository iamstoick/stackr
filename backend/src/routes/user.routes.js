import { Router } from 'express';
import { z } from 'zod';

import notificationController from '../controllers/notificationController.js';
import { writeLimiter } from '../middleware/rateLimit.js';
import validate from '../middleware/validate.js';
import favoriteService from '../services/market/favoriteService.js';
import alertService from '../services/alerts/alertService.js';
import asyncHandler from '../utils/asyncHandler.js';
import requireAuth from '../middleware/requireAuth.js';

const router = Router();

const hour = z.coerce.number().int().min(0).max(23).nullable().optional();

const notificationBody = z
  .object({
    emailEnabled: z.boolean().optional(),
    webhookEnabled: z.boolean().optional(),
    webhookUrl: z.string().trim().max(2000).nullish(),
    quietHoursStart: hour,
    quietHoursEnd: hour,
    timezone: z.string().trim().max(64).optional(),
  })
  .refine(
    (value) =>
      (value.quietHoursStart === null || value.quietHoursStart === undefined) ===
      (value.quietHoursEnd === null || value.quietHoursEnd === undefined),
    { message: 'Set both ends of the quiet-hours window, or neither' },
  );

router.use(requireAuth);

/** GET /api/user/profile */
router.get('/profile', (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      avatarUrl: req.user.avatarUrl,
      createdAt: req.user.createdAt,
    },
  });
});

/** GET /api/user/summary — counts for the dashboard header. */
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const [favorites, rules, history] = await Promise.all([
      favoriteService.list(req.user.id),
      alertService.listRules(req.user.id),
      alertService.listHistory(req.user.id, { limit: 1, unacknowledgedOnly: true }),
    ]);

    res.json({
      summary: {
        favorites: favorites.length,
        alertRules: rules.length,
        activeAlertRules: rules.filter((r) => r.enabled).length,
        unacknowledgedAlerts: history.total,
      },
    });
  }),
);

/** GET /api/user/notifications */
router.get('/notifications', notificationController.getSettings);

/** PUT /api/user/notifications */
router.put(
  '/notifications',
  writeLimiter,
  validate({ body: notificationBody }),
  notificationController.updateSettings,
);

export default router;
