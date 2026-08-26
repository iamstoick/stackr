import { Router } from 'express';
import { z } from 'zod';

import paperController from '../controllers/paperController.js';
import { writeLimiter } from '../middleware/rateLimit.js';
import requireAuth from '../middleware/requireAuth.js';
import validate from '../middleware/validate.js';

const router = Router();

const symbol = z
  .string()
  .trim()
  .min(1)
  .max(15)
  .regex(/^[A-Za-z0-9.\-]+$/)
  .transform((value) => value.toUpperCase());

const orderBody = z.object({
  symbol,
  side: z.enum(['BUY', 'SELL']),
  // Fractional quantities are allowed: a beginner with practice money should not
  // be blocked from a $300 share.
  quantity: z.coerce.number().positive().max(1_000_000),
});

const tradesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  symbol: symbol.optional(),
});

router.use(requireAuth);

router.get('/portfolio', paperController.getPortfolio);
router.get('/scorecard', paperController.getScorecard);
router.get('/trades', validate({ query: tradesQuery }), paperController.listTrades);

router.post('/orders/preview', validate({ body: orderBody }), paperController.previewOrder);
router.post('/orders', writeLimiter, validate({ body: orderBody }), paperController.placeOrder);
router.post('/reset', writeLimiter, paperController.resetPortfolio);

export default router;
