/** Indeterminate bar: reads as an instrument warming up, not a spinner. */
export function Loading({ label = 'Loading', className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`} role="status" aria-live="polite">
      <span className="relative block h-[3px] w-16 overflow-hidden rounded-full bg-ink-800">
        <span className="absolute inset-y-0 left-0 w-1/3 animate-[sweep_1.1s_ease-in-out_infinite] rounded-full bg-signal" />
      </span>
      <span className="label">{label}</span>
      <style>{`@keyframes sweep {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(320%); }
      }`}</style>
    </div>
  );
}

/** Placeholder rows used while a table's first page loads. */
export function SkeletonRows({ rows = 4, className = '' }) {
  return (
    <div className={`divide-y divide-ink-800 ${className}`} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <div className="h-3 w-16 animate-pulse rounded bg-ink-800" />
          <div className="h-3 flex-1 animate-pulse rounded bg-ink-850" />
          <div className="h-3 w-20 animate-pulse rounded bg-ink-800" />
        </div>
      ))}
    </div>
  );
}

export default Loading;
