// Route-specific Suspense fallback for /match/[id]. Mirrors the breadcrumb +
// hero + panels layout so the pre-shell flash matches what renders next.
export default function MatchDetailLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <div className="h-5 w-64 animate-pulse rounded-full bg-[var(--background-soft)]" />
      <div className="h-48 animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]" />
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-64 animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]"
          />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]" />
    </div>
  );
}
