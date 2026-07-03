// Suspense boundary for the dashboard route group. Its presence is what makes
// Link prefetch cheap: App Router prefetch stops at this boundary, so warming a
// nav link fetches the shared layout + this static skeleton + the route JS
// chunk only — it does NOT execute the target route's async data loaders. That
// is why nav links prefetch by default (no render stampede). Real navigations
// briefly show this skeleton before the streamed content lands.
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
