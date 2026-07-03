// Route-level shell for /people: paints instantly on navigation while the
// (now bounded) people query resolves. Mirrors the real layout — header, the
// 5-up stat row, filter bar, and the directory table — so there is no layout
// shift when the data streams in.
export default function PeopleLoading() {
  return (
    <div className="space-y-10" aria-busy="true" aria-live="polite">
      <div className="space-y-3">
        <div className="h-8 w-64 animate-pulse rounded-[var(--panel-radius)] bg-[var(--background-soft)]" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-[var(--panel-radius)] bg-[var(--background-soft)]" />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]"
          />
        ))}
      </div>

      <div className="h-12 animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]" />

      <div className="h-[28rem] animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]" />
    </div>
  );
}
