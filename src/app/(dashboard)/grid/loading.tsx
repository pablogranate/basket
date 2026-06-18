import { GridContentSkeleton } from "@/components/grid/grid-regions";

// Route-specific Suspense fallback for /grid. Mirrors the real toolbar + content
// layout so the brief pre-chrome flash (and prefetch-capped skeleton) matches
// what renders next instead of the generic dashboard card skeleton — no jarring
// reflow on navigation. With the page streaming its own regions, this only shows
// until the static chrome's first flush.
export default function GridLoading() {
  return (
    <div
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="relative z-0 min-w-0 space-y-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="h-9 w-72 animate-pulse rounded-[var(--panel-radius)] bg-[var(--background-soft)]" />
            <div className="h-4 w-96 max-w-full animate-pulse rounded-[var(--panel-radius)] bg-[var(--background-soft)]" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="size-[52px] animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]"
              />
            ))}
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="h-4 w-24 animate-pulse rounded-full bg-[var(--background-soft)]" />
            <div className="flex flex-wrap items-center justify-end gap-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-[52px] w-24 animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]"
                />
              ))}
            </div>
          </div>
          <GridContentSkeleton />
        </div>
      </div>

      <aside className="relative z-20 min-w-0 self-start xl:sticky xl:top-24">
        <div className="h-[28rem] animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]" />
      </aside>
    </div>
  );
}
