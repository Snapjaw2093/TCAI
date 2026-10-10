// The "still loading" and "something went wrong" screens, shared by every page.

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      <div className="h-24 animate-pulse rounded-xl bg-slate-200/70" />
      <div className="h-24 animate-pulse rounded-xl bg-slate-200/70" />
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-6 py-5">
      <p className="font-medium text-rose-800">Something went wrong</p>
      <p className="mt-1 text-sm text-rose-700">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100"
        >
          Try again
        </button>
      )}
    </div>
  );
}
