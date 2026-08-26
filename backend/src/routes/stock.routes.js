import { Router } from 'express';
import { z } from 'zod';

import stockController from '../controllers/stockController.js';
import { searchLimiter } from '../middleware/rateLimit.js';
import requireAuth from '../middleware/requireAuth.js';
import validate from '../middleware/validate.js';
import { DEFAULT_RANGE, RANGE_KEYS } from '../services/market/rangeMapper.js';

const router = Router();

const symbolParam = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(15)
    .regex(/^[A-Za-z0-9.\-]+$/, 'Symbol may contain letters, digits, dots and hyphens only')
    .transform((v) => v.toUpperCase()),
});

const searchQuery = z.object({
  q: z.string().trim().min(2, 'Search term must be at least 2 characters').max(50),
});

const candlesQuery = z.object({
  range: z.enum(RANGE_KEYS).default(DEFAULT_RANGE),
});

const riskQuery = z.object({
  range: z.enum(RANGE_KEYS).default(DEFAULT_RANGE),
  positionValue: z.coerce.number().positive().max(10_000_000).default(1000),
});

// Every stock route requires authentication: the Finnhub key is a server-side
// credential and must not be usable by anonymous callers.
router.use(requireAuth);

router.get('/search', searchLimiter, validate({ query: searchQuery }), stockController.search);
router.get('/:symbol', validate({ params: symbolParam }), stockController.getStock);
router.get('/:symbol/quote', validate({ params: symbolParam }), stockController.getQuote);
router.get(
  '/:symbol/candles',
  validate({ params: symbolParam, query: candlesQuery }),
  stockController.getCandles,
);
router.get(
  '/:symbol/risk',
  validate({ params: symbolParam, query: riskQuery }),
  stockController.getRisk,
);

export default router;
