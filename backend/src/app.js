import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import config from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';
import requestLogger from './middleware/requestLogger.js';
import routes from './routes/index.js';
import { configurePassport } from './services/auth/passport.js';

export function createApp() {
  const app = express();

  // Nginx terminates the client connection; trust exactly one hop so req.ip and
  // the rate limiter see the real client address.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON only; the SPA is served by Nginx, which sets its own
      // headers, so a CSP here would have no document to apply to.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // Same-origin in Docker (Nginx fronts both), so CORS only matters for the
  // Vite dev server. Credentials are required for the auth cookie.
  const allowedOrigins = new Set(
    [config.frontendUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'].filter(Boolean),
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        return callback(new Error('Origin not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );

  app.use(requestLogger);
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());

  const passport = configurePassport();
  app.use(passport.initialize());

  app.use('/api', apiLimiter);
  app.use(routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
