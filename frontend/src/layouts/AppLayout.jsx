import { Outlet } from 'react-router-dom';

import { Navbar } from '../components/Navbar.jsx';
import useAsync from '../hooks/useAsync.js';
import api from '../services/api.js';

/** Chrome shared by every authenticated page. */
export function AppLayout() {
  // The alert badge is the one piece of global state worth polling for.
  const { data: summary } = useAsync(
    async ({ signal }) => (await api.get('/user/summary', { signal })).data.summary,
    [],
    { refreshMs: 60_000 },
  );

  return (
    <div className="min-h-dvh">
      <Navbar unacknowledgedCount={summary?.unacknowledgedAlerts ?? 0} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">
        <p className="border-t border-ink-800 pt-4 text-xs text-faint">
          Prices are provided by Finnhub and may be delayed. Stackr is a monitoring tool, not
          investment advice.
        </p>
      </footer>
    </div>
  );
}

export default AppLayout;
