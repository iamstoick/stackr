/**
 * Error surface. Says what happened and what to do about it — the API's own
 * message is already written for the reader, so it is shown verbatim.
 */
export function ErrorState({ error, onRetry, className = '' }) {
  const code = error?.code;
  const message = error?.message ?? 'Something went wrong.';

  const hint = {
    NETWORK_ERROR: 'The API may still be starting up.',
    TIMEOUT: 'The provider took too long to answer.',
    RATE_LIMITED: 'Wait a few seconds before retrying.',
    PROVIDER_NOT_CONFIGURED:
      'Set FINNHUB_API_KEY (quotes) and TWELVEDATA_API_KEY (charts) on the server, then restart the backend.',
    PROVIDER_ACCESS_DENIED:
      'The market data key was rejected, or this data is not included in the current plan. ' +
      'Charts need TWELVEDATA_API_KEY — Finnhub gates historical candles behind a paid plan.',
    PROVIDER_ERROR: 'The market data provider is having trouble.',
    STOCK_NOT_FOUND: 'Check the symbol and try another search.',
  }[code];

  return (
    <div className={`panel p-5 ${className}`} role="alert">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-down/50 text-[11px] font-semibold text-down">
          !
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-paper">{message}</p>
          {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
          {code && <p className="label mt-2">{code}</p>}
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-md border border-ink-700 px-3 py-1.5 text-sm font-medium text-paper transition hover:border-signal hover:text-signal"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export default ErrorState;
