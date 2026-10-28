// Shared loading and error states for the app screens.

export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2.5" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-[78px] animate-pulse rounded-[18px] bg-surface shadow-card" />
      ))}
    </div>
  );
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[18px] bg-surface px-4 py-3.5 shadow-card" role="alert">
      <div>
        <div className="font-bold">{message}</div>
        <div className="text-sm text-muted">Check your connection and try again.</div>
      </div>
      <button className="btn btn-ghost flex-none" type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

/** A plain row, for empty states like "No habits yet". */
export function EmptyRow({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[18px] bg-surface px-4 py-3.5 shadow-card">
      <div className="font-bold">{title}</div>
      <div className="text-sm text-muted">{body}</div>
    </div>
  );
}
