import { Router } from 'express';

import authController from '../controllers/authController.js';
import { authLimiter } from '../middleware/rateLimit.js';
import requireAuth from '../middleware/requireAuth.js';

const router = Router();

// Public
router.get('/config', authController.getAuthConfig);
router.get('/google', authLimiter, authController.startGoogleLogin);
router.get(
  '/google/callback',
  authLimiter,
  authController.verifyOAuthState,
  authController.completeGoogleLogin,
);

// Authenticated
router.get('/me', requireAuth, authController.getCurrentUser);
router.post('/logout', authController.logout);

export default router;
