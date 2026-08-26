import { Router } from 'express';
import { z } from 'zod';

import { writeLimiter } from '../middleware/rateLimit.js';
import requireAuth from '../middleware/requireAuth.js';
import validate from '../middleware/validate.js';
import onboardingService from '../services/learning/onboardingService.js';
import {
  marketSession,
  nextMarketClose,
  nextMarketOpen,
} from '../services/market/marketCalendar.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = Router();

router.use(requireAuth);

/** GET /api/learn/progress — getting-started state, derived from real activity. */
router.get(
  '/progress',
  asyncHandler(async (req, res) => {
    res.json({ onboarding: await onboardingService.getState(req.user.id) });
  }),
);

/** POST /api/learn/lessons/:id/read */
router.post(
  '/lessons/:id/read',
  writeLimiter,
  validate({
    params: z.object({ id: z.string().trim().min(1).max(64).regex(/^[a-z0-9-]+$/) }),
  }),
  asyncHandler(async (req, res) => {
    res.json({ onboarding: await onboardingService.markLessonRead(req.user.id, req.params.id) });
  }),
);

/** POST /api/learn/checklist/dismiss */
router.post(
  '/checklist/dismiss',
  writeLimiter,
  validate({ body: z.object({ dismissed: z.boolean().default(true) }) }),
  asyncHandler(async (req, res) => {
    res.json({
      onboarding: await onboardingService.setDismissed(req.user.id, req.body.dismissed),
    });
  }),
);

/**
 * GET /api/learn/market-clock
 *
 * Most beginners do not know when the market is open, so the app says so
 * explicitly rather than leaving them to infer it from a stale price.
 */
router.get('/market-clock', (_req, res) => {
  const session = marketSession();
  res.json({
    clock: {
      ...session,
      nextOpen: nextMarketOpen(),
      nextClose: nextMarketClose(),
    },
  });
});

export default router;
