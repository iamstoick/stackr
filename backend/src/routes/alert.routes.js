import { Router } from 'express';
import { z } from 'zod';

import alertController from '../controllers/alertController.js';
import { writeLimiter } from '../middleware/rateLimit.js';
import requireAuth from '../middleware/requireAuth.js';
import validate from '../middleware/validate.js';

const router = Router();

const idParam = z.object({
  id: z.coerce.number().int().positive(),
});

const symbol = z
  .string()
  .trim()
  .min(1)
  .max(15)
  .regex(/^[A-Za-z0-9.\-]+$/)
  .transform((v) => v.toUpperCase());

const listQuery = z.object({
  symbol: symbol.optional(),
});

// Hygiene options: a threshold that fires forever, at any hour, on any print is
// rarely what someone actually wants.
const hygiene = {
  cooldownMinutes: z.coerce.number().int().min(0).max(10_080).optional(),
  expiresAt: z.coerce.date().nullish(),
  marketHoursOnly: z.boolean().optional(),
  trailPercent: z.coerce.number().gt(0).lt(100).nullish(),
};

const createBody = z.object({
  symbol,
  type: z.enum(['BUY', 'SELL']),
  condition: z.enum(['ABOVE', 'BELOW']),
  threshold: z.coerce.number().positive().max(1_000_000),
  enabled: z.boolean().default(true),
  ...hygiene,
});

const updateBody = z
  .object({
    type: z.enum(['BUY', 'SELL']).optional(),
    condition: z.enum(['ABOVE', 'BELOW']).optional(),
    threshold: z.coerce.number().positive().max(1_000_000).optional(),
    enabled: z.boolean().optional(),
    ...hygiene,
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

const historyQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  unacknowledged: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

router.use(requireAuth);

// `/history` is declared before `/:id` so it is not captured as an id.
router.get('/history', validate({ query: historyQuery }), alertController.listHistory);

router.get('/', validate({ query: listQuery }), alertController.listRules);
router.post('/', writeLimiter, validate({ body: createBody }), alertController.createRule);
router.patch(
  '/:id',
  writeLimiter,
  validate({ params: idParam, body: updateBody }),
  alertController.updateRule,
);
router.delete('/:id', writeLimiter, validate({ params: idParam }), alertController.deleteRule);
router.post(
  '/:id/acknowledge',
  writeLimiter,
  validate({ params: idParam }),
  alertController.acknowledge,
);
// Confirms a threshold after a corporate action paused it.
router.post('/:id/resume', writeLimiter, validate({ params: idParam }), alertController.resumeRule);

export default router;
