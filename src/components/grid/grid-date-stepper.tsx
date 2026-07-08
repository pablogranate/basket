import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

// Prev/next date navigation for /grid, shared by the mobile nav and the
// desktop toolbar. Steps by day or month depending on the current view (the
// hrefs are built upstream in the page against `filters.view`).
export function GridDateStepper({
  prevHref,
  nextHref,
  dateLabel,
  className,
}: {
  prevHref: string;
  nextHref: string;
  dateLabel: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5",
        className,
      )}
    >
      <a
        href={prevHref}
        aria-label="Fecha anterior"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--n-500)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent)]"
      >
        <ChevronLeft className="size-4" />
      </a>
      <span className="truncate px-1 text-[11px] font-extrabold uppercase tracking-[0.2em] text-[var(--foreground)]">
        {dateLabel}
      </span>
      <a
        href={nextHref}
        aria-label="Fecha siguiente"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--n-500)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent)]"
      >
        <ChevronRight className="size-4" />
      </a>
    </div>
  );
}
