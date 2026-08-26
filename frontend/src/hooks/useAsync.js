import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs an async loader and tracks loading/error/data, cancelling the in-flight
 * request when dependencies change or the component unmounts.
 *
 * @param {(opts: {signal: AbortSignal}) => Promise<any>} loader
 * @param {Array} deps
 * @param {{enabled?: boolean, refreshMs?: number}} options
 */
export function useAsync(loader, deps = [], { enabled = true, refreshMs = 0 } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;

    // Background refreshes must not blank the screen, so only the first load
    // for a given set of dependencies shows the loading state.
    const run = async (isBackground) => {
      if (!isBackground) setIsLoading(true);
      try {
        const result = await loaderRef.current({ signal: controller.signal });
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled && err.name !== 'CanceledError' && err.name !== 'AbortError') {
          setError(err);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    run(false);

    const timer = refreshMs > 0 ? setInterval(() => run(true), refreshMs) : null;

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, refreshMs, reloadToken]);

  return { data, error, isLoading, reload, setData };
}

export default useAsync;
