import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import useAsync from '../hooks/useAsync.js';
import useDebounce from '../hooks/useDebounce.js';
import stockApi from '../services/stockApi.js';
import { Loading } from './Loading.jsx';

const MIN_LENGTH = 2;

/**
 * Symbol search. Input is debounced and only queried from two characters up, so
 * typing a ticker costs one request rather than one per keystroke.
 */
export function StockSearch({ autoFocus = false, placeholder = 'Search a symbol or company' }) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const listboxId = useId();

  const debounced = useDebounce(term.trim(), 350);
  const enabled = debounced.length >= MIN_LENGTH;

  const { data: results, error, isLoading } = useAsync(
    ({ signal }) => stockApi.searchStocks(debounced, { signal }),
    [debounced],
    { enabled },
  );

  const items = enabled ? (results ?? []) : [];

  useEffect(() => setActiveIndex(-1), [debounced]);

  // Close when focus or the pointer leaves the combobox.
  useEffect(() => {
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const go = (symbol) => {
    setOpen(false);
    setTerm('');
    navigate(`/stocks/${encodeURIComponent(symbol)}`);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (items.length === 0) return;
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setOpen(true);
      setActiveIndex((index) => (index + delta + items.length) % items.length);
      return;
    }
    if (event.key === 'Enter') {
      const chosen = items[activeIndex] ?? items[0];
      if (chosen) {
        event.preventDefault();
        go(chosen.symbol);
      } else if (term.trim().length > 0) {
        event.preventDefault();
        go(term.trim().toUpperCase());
      }
    }
  };

  const showPanel = open && (enabled || term.length > 0);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center gap-2.5 rounded-md border border-ink-800 bg-ink-900 px-3 py-2 focus-within:border-signal/60">
        <span aria-hidden="true" className="text-sm text-faint">
          ⌕
        </span>
        <input
          type="search"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label="Search stocks"
          aria-expanded={showPanel}
          aria-controls={listboxId}
          aria-autocomplete="list"
          role="combobox"
          className="tabular w-full bg-transparent text-sm text-paper uppercase placeholder:normal-case placeholder:text-faint focus:outline-none"
        />
        {isLoading && enabled && <Loading label="" />}
      </div>

      {showPanel && (
        <div className="panel absolute z-30 mt-1.5 w-full overflow-hidden shadow-2xl shadow-black/50">
          {!enabled && (
            <p className="px-4 py-3 text-sm text-muted">Type at least {MIN_LENGTH} characters.</p>
          )}

          {enabled && error && <p className="px-4 py-3 text-sm text-down">{error.message}</p>}

          {enabled && !error && items.length === 0 && !isLoading && (
            <p className="px-4 py-3 text-sm text-muted">
              No matches for “{debounced}”. Try a ticker like AAPL.
            </p>
          )}

          {items.length > 0 && (
            <ul id={listboxId} role="listbox" className="max-h-80 divide-y divide-ink-850 overflow-y-auto">
              {items.map((item, index) => (
                <li key={item.symbol} role="option" aria-selected={index === activeIndex}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => go(item.symbol)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                      index === activeIndex ? 'bg-ink-850' : 'hover:bg-ink-850'
                    }`}
                  >
                    <span className="tabular w-20 shrink-0 text-sm font-medium text-paper">
                      {item.symbol}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted">
                      {item.companyName ?? '—'}
                    </span>
                    {item.type && <span className="label shrink-0">{item.type}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default StockSearch;
