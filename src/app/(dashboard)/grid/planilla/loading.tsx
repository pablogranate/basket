export default function GridPlanillaLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="h-9 w-48 animate-pulse rounded-[var(--panel-radius)] bg-[var(--background-soft)]" />
      <div className="h-[70vh] animate-pulse rounded-[var(--panel-radius)] bg-[var(--background-soft)]" />
    </div>
  );
}
