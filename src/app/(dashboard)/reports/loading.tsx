// Route-specific Suspense fallback for /reports: header + toolbar + table rows.
export default function ReportsLoading() {
  return (
    <div className="min-w-0 space-y-8" aria-busy="true" aria-live="polite">
      <div className="space-y-3">
        <div className="h-8 w-64 animate-pulse rounded-[var(--panel-radius)] bg-[var(--background-soft)]" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-[var(--panel-radius)] bg-[var(--background-soft)]" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-11 w-40 animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]"
          />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-16 animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]"
          />
        ))}
      </div>
    </div>
  );
}
