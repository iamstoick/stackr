import { useState } from 'react';

import favoriteApi from '../services/favoriteApi.js';

/**
 * Toggles a symbol on the watchlist. Optimistic, because the API is idempotent
 * on both sides — a failed call simply rolls the label back.
 */
export function FavoriteButton({ symbol, isFavorite, onChange, size = 'md' }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const toggle = async () => {
    setPending(true);
    setError(null);
    const next = !isFavorite;
    onChange?.(next);

    try {
      if (next) await favoriteApi.addFavorite(symbol);
      else await favoriteApi.removeFavorite(symbol);
    } catch (err) {
      onChange?.(!next);
      setError(err.message);
    } finally {
      setPending(false);
    }
  };

  const compact = size === 'sm';

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={isFavorite}
        className={`inline-flex items-center gap-2 rounded-md border font-medium transition disabled:opacity-60 ${
          compact ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'
        } ${
          isFavorite
            ? 'border-signal/45 bg-signal/10 text-signal hover:bg-signal/15'
            : 'border-ink-700 text-paper hover:border-signal/60 hover:text-signal'
        }`}
      >
        <span aria-hidden="true" className="text-[13px] leading-none">
          {isFavorite ? '★' : '☆'}
        </span>
        {isFavorite ? 'On watchlist' : 'Add to watchlist'}
      </button>
      {error && <span className="text-xs text-down">{error}</span>}
    </div>
  );
}

export default FavoriteButton;
