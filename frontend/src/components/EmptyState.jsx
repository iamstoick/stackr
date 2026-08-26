/** An empty screen is an invitation to act, so it always carries the action. */
export function EmptyState({ title, description, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center px-6 py-12 text-center ${className}`}>
      <span
        aria-hidden="true"
        className="mb-4 h-px w-24 bg-[repeating-linear-gradient(to_right,var(--color-signal)_0_6px,transparent_6px_12px)] opacity-60"
      />
      <p className="text-base font-medium text-paper">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export default EmptyState;
