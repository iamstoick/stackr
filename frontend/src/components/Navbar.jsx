import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

import useAuth from '../hooks/useAuth.js';
import { MarketClock } from './MarketClock.jsx';
import { StockSearch } from './StockSearch.jsx';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/practice', label: 'Practice' },
  { to: '/learn', label: 'Learn' },
];

function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="Stackr home">
      <span aria-hidden="true" className="relative block h-5 w-6">
        <span className="absolute inset-x-0 top-1/2 h-px bg-signal [mask-image:repeating-linear-gradient(to_right,black_0_3px,transparent_3px_6px)]" />
        <svg viewBox="0 0 24 20" className="absolute inset-0" fill="none">
          <path
            d="M1 16 7 9l3.5 3.5L17 3"
            stroke="var(--color-up)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Stackr</span>
    </Link>
  );
}

function itemClass({ isActive }) {
  return `rounded-md px-3 py-1.5 text-sm font-medium transition ${
    isActive ? 'bg-ink-850 text-paper' : 'text-muted hover:text-paper'
  }`;
}

/** Top bar: identity, primary navigation, search, account. */
export function Navbar({ unacknowledgedCount = 0 }) {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-ink-800 bg-ink-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
        <Wordmark />

        <MarketClock className="order-2 sm:order-none" />

        <nav
          aria-label="Main"
          className="order-4 flex w-full items-center gap-1 overflow-x-auto sm:order-none sm:w-auto"
        >
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={itemClass}>
              {item.label}
              {item.label === 'Alerts' && unacknowledgedCount > 0 && (
                <span className="tabular ml-2 rounded bg-signal px-1.5 py-0.5 text-[11px] font-semibold text-ink-950">
                  {unacknowledgedCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="order-5 w-full min-w-0 sm:order-none sm:ml-auto sm:w-64 lg:w-80">
          <StockSearch />
        </div>

        <div className="relative order-3 sm:order-none">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="flex items-center gap-2 rounded-md border border-ink-800 px-2 py-1.5 text-sm text-paper transition hover:border-ink-700"
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="size-6 rounded-full" />
            ) : (
              <span className="flex size-6 items-center justify-center rounded-full bg-ink-800 text-xs">
                {(user?.name ?? user?.email ?? '?').charAt(0).toUpperCase()}
              </span>
            )}
            <span className="hidden max-w-32 truncate sm:inline">{user?.name ?? user?.email}</span>
          </button>

          {menuOpen && (
            <div role="menu" className="panel absolute right-0 z-50 mt-2 w-56 p-1.5">
              <p className="px-2.5 py-2 text-xs text-faint break-all">{user?.email}</p>
              <Link
                to="/account"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="block rounded px-2.5 py-2 text-sm text-paper transition hover:bg-ink-850"
              >
                Notifications
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={signOut}
                className="w-full rounded px-2.5 py-2 text-left text-sm text-paper transition hover:bg-ink-850"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Navbar;
