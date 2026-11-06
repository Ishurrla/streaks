// Shared loading and error states for the app screens.

/**
 * Pulsing placeholder cards. <output> is the native role="status", announced as "Loading";
 * it holds inline content only, so the cards are block spans.
 */
export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <output className="flex flex-col gap-2.5" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="block h-19.5 animate-pulse rounded-[18px] bg-surface shadow-card" />
      ))}
    </output>
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
