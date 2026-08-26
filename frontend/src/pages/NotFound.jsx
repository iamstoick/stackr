import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="flex min-h-64 flex-col items-start justify-center gap-3">
      <p className="tabular text-sm text-signal">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">This page does not exist</h1>
      <p className="max-w-md text-sm text-muted">
        Check the address, or head back to your dashboard and search for a symbol.
      </p>
      <Link
        to="/"
        className="mt-2 rounded-md border border-ink-700 px-3.5 py-2 text-sm font-medium transition hover:border-signal hover:text-signal"
      >
        Go to dashboard
      </Link>
    </div>
  );
}

export default NotFound;
