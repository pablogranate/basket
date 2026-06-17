// Suspense boundary for the dashboard route group. Its presence is what caps
// Next.js Link prefetching to a cheap skeleton: prefetch fetches this fallback
// instead of fully rendering the target route (and running its data loaders) on
// the server. Without it, hovering/viewport-prefetched nav links stampede the
// server with full page renders. Real navigations briefly show this skeleton.
export default function DashboardLoading() {
  return (
    <div className="min-w-0 space-y-8" aria-busy="true" aria-live="polite">
      <div className="space-y-3">
        <div className="h-8 w-64 animate-pulse rounded-[var(--panel-radius)] bg-[var(--background-soft)]" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-[var(--panel-radius)] bg-[var(--background-soft)]" />
      </div>
      <div className="grid gap-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]"
          />
        ))}
      </div>
    </div>
  );
}
