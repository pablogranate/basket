// Route-level shell for /mi-jornada: paints instantly on navigation while the
// collaborator's assignments load. Mirrors the panel layout — greeting header,
// the two summary cards, and the assignment card — to avoid layout shift.
export default function CollaboratorDayLoading() {
  return (
    <div className="w-full max-w-none pb-10" aria-busy="true" aria-live="polite">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="space-y-3">
          <div className="mx-auto h-4 w-40 animate-pulse rounded-full bg-[var(--background-soft)] md:mx-0" />
          <div className="mx-auto h-9 w-64 animate-pulse rounded-[var(--panel-radius)] bg-[var(--background-soft)] md:mx-0" />
        </div>
        <div className="order-2 grid grid-cols-2 gap-3 md:col-span-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)]"
            />
          ))}
        </div>
      </div>

      <div className="mt-8 h-72 animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]" />
    </div>
  );
}
