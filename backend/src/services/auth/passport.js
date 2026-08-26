import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

import config from '../../config/env.js';
import userRepository from '../../db/repositories/userRepository.js';
import logger from '../../utils/logger.js';

/**
 * Registers the Google strategy when credentials are configured. Google is used
 * purely for identity, so the OAuth access/refresh tokens are intentionally
 * discarded rather than persisted.
 */
export function configurePassport() {
  if (!config.features.googleOAuth) {
    logger.warn('Google OAuth is not configured; /api/auth/google will return 503.');
    return passport;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientId,
        clientSecret: config.google.clientSecret,
        callbackURL: config.google.callbackUrl,
        scope: ['profile', 'email'],
        // No session store, so CSRF state is handled by a signed cookie in the
        // auth controller rather than passport's session-backed store.
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(null, false, { message: 'Google account has no usable email address.' });
          }

          const user = await userRepository.upsertFromGoogleProfile({
            googleId: profile.id,
            email: email.toLowerCase(),
            name: profile.displayName ?? null,
            avatarUrl: profile.photos?.[0]?.value ?? null,
          });
          logger.info({ userId: user.id }, 'Google authentication succeeded');
          return done(null, user);
        } catch (err) {
          logger.error({ err }, 'Google authentication failed');
          return done(err);
        }
      },
    ),
  );

  return passport;
}

export default passport;
