import { Router } from 'express';
import { z } from 'zod';

import favoriteController from '../controllers/favoriteController.js';
import { writeLimiter } from '../middleware/rateLimit.js';
import requireAuth from '../middleware/requireAuth.js';
import validate from '../middleware/validate.js';

const router = Router();

const symbolParam = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(15)
    .regex(/^[A-Za-z0-9.\-]+$/)
    .transform((v) => v.toUpperCase()),
});

router.use(requireAuth);

router.get('/', favoriteController.list);
router.post('/:symbol', writeLimiter, validate({ params: symbolParam }), favoriteController.add);
router.delete('/:symbol', writeLimiter, validate({ params: symbolParam }), favoriteController.remove);

export default router;
