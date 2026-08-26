import { Navigate, useSearchParams } from 'react-router-dom';

import useAuth from '../hooks/useAuth.js';
import { Loading } from '../components/Loading.jsx';

const OAUTH_ERRORS = {
  invalid_state: 'That sign-in link expired. Start again.',
  oauth_failed: 'Google could not complete the sign-in. Try again.',
  access_denied: 'Sign-in was cancelled.',
};

export function Login() {
  const { isAuthenticated, isLoading, googleEnabled, signIn } = useAuth();
  const [params] = useSearchParams();
  const error = OAUTH_ERRORS[params.get('error')];

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loading label="Checking your session" />
      </div>
    );
  }

  if (isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Left: the thesis — a threshold, and a price crossing it. */}
      <section className="relative hidden overflow-hidden border-r border-ink-800 lg:block">
        <div className="absolute inset-0 flex items-center justify-center p-16">
          <svg viewBox="0 0 480 320" className="w-full max-w-xl" role="img" aria-label="A price line crossing a threshold">
            <defs>
              <linearGradient id="loginFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-up)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--color-up)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {[80, 140, 200, 260].map((y) => (
              <line key={y} x1="0" y1={y} x2="480" y2={y} stroke="var(--color-ink-800)" strokeWidth="1" />
            ))}

            <path
              d="M0 250 L60 232 L110 258 L165 196 L220 214 L275 150 L330 168 L385 96 L440 112 L480 64"
              fill="none"
              stroke="var(--color-up)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M0 250 L60 232 L110 258 L165 196 L220 214 L275 150 L330 168 L385 96 L440 112 L480 64 L480 320 L0 320 Z"
              fill="url(#loginFill)"
            />

            <line
              x1="0"
              y1="140"
              x2="480"
              y2="140"
              stroke="var(--color-signal)"
              strokeWidth="2"
              strokeDasharray="6 5"
            />
            <circle cx="300" cy="140" r="5.5" fill="var(--color-signal)" />
            <text
              x="0"
              y="128"
              fill="var(--color-signal)"
              fontSize="12"
              fontFamily="IBM Plex Mono, monospace"
            >
              SELL ≥ 210.00
            </text>
          </svg>
        </div>

        <p className="absolute bottom-10 left-12 max-w-sm text-sm text-faint">
          Set the line once. The server checks the price every few minutes and tells you when it
          crosses.
        </p>
      </section>

      {/* Right: the single action. */}
      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <p className="label">Stackr</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-paper">
            Watch your prices,
            <br />
            not your screen.
          </h1>
          <p className="mt-4 text-sm text-muted">
            Track a handful of stocks, chart their history, and set buy and sell thresholds. Sign in
            with Google to get your watchlist.
          </p>

          {googleEnabled ? (
            <button
              type="button"
              onClick={signIn}
              className="mt-8 flex w-full items-center justify-center gap-3 rounded-md bg-paper px-4 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-white"
            >
              <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.3-.2-1.9H9v3.6h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.6Z" />
                <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.2-3.8H.9v2.3A9 9 0 0 0 9 18Z" />
                <path fill="#FBBC05" d="M3.8 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8l2.9-2.3Z" />
                <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 5l2.9 2.3C4.6 5.2 6.6 3.6 9 3.6Z" />
              </svg>
              Continue with Google
            </button>
          ) : (
            <div className="mt-8 rounded-md border border-signal/40 bg-signal/5 p-4">
              <p className="text-sm text-paper">Google sign-in is not configured on this server.</p>
              <p className="mt-1.5 text-sm text-muted">
                Set <code className="tabular text-signal">GOOGLE_CLIENT_ID</code> and{' '}
                <code className="tabular text-signal">GOOGLE_CLIENT_SECRET</code>, then restart the
                backend.
              </p>
            </div>
          )}

          {error && (
            <p className="mt-4 text-sm text-down" role="alert">
              {error}
            </p>
          )}

          <p className="mt-10 text-xs text-faint">
            Stackr stores your email, name and watchlist. Market data comes from Finnhub and may be
            delayed.
          </p>
        </div>
      </section>
    </div>
  );
}

export default Login;
