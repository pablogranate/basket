// Route-specific Suspense fallback for /teams: header + league tabs + card grid.
export default function TeamsLoading() {
  return (
    <div className="space-y-10" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <div className="h-8 w-64 animate-pulse rounded-[var(--panel-radius)] bg-[var(--background-soft)]" />
          <div className="h-4 w-96 max-w-full animate-pulse rounded-[var(--panel-radius)] bg-[var(--background-soft)]" />
        </div>
        <div className="h-[52px] w-full max-w-[22rem] animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]" />
      </div>
      <div className="flex gap-6 border-b border-[var(--accent-border)] pb-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-5 w-24 animate-pulse rounded-full bg-[var(--background-soft)]"
          />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-44 animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]"
          />
        ))}
      </div>
    </div>
  );
}
