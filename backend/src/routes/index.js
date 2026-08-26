import { Router } from 'express';

import healthController from '../controllers/healthController.js';
import alertRoutes from './alert.routes.js';
import authRoutes from './auth.routes.js';
import favoriteRoutes from './favorite.routes.js';
import learnRoutes from './learn.routes.js';
import paperRoutes from './paper.routes.js';
import stockRoutes from './stock.routes.js';
import userRoutes from './user.routes.js';

const router = Router();

// Health probes live outside /api so container and load-balancer checks do not
// depend on the API surface.
router.get('/health', healthController.live);
router.get('/health/ready', healthController.ready);

router.use('/api/auth', authRoutes);
router.use('/api/stocks', stockRoutes);
router.use('/api/favorites', favoriteRoutes);
router.use('/api/alerts', alertRoutes);
router.use('/api/paper', paperRoutes);
router.use('/api/learn', learnRoutes);
router.use('/api/user', userRoutes);

export default router;
