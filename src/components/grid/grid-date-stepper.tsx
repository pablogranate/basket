"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { GridNavPending } from "@/components/grid/grid-nav-pending";
import { cn } from "@/lib/utils";

// Prev/next date navigation for /grid, shared by the mobile nav and the
// desktop toolbar. Steps by day or month depending on the current view (the
// hrefs are built upstream in the page against `filters.view`).
//
// These were raw <a> until the client-nav round: a full document navigation per
// step discarded the Client Router Cache (making next.config's staleTimes
// inert), re-downloaded and re-evaluated the bundle, and re-parsed the whole
// RSC payload on every arrow click.
//
// Prefetch is deliberately hover/focus-driven rather than eager. A month view
// payload is multi-megabyte, so prefetching both arrows on every render would
// pull two extra copies of it for a step the user may never take. Warming on
// intent costs nothing until there is intent.
const stepButtonClassName =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--n-500)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent)]";

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
  const router = useRouter();

  function warm(href: string) {
    router.prefetch(href);
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5",
        className,
      )}
    >
      <Link
        href={prevHref}
        prefetch={false}
        onPointerEnter={() => warm(prevHref)}
        onFocus={() => warm(prevHref)}
        aria-label="Fecha anterior"
        className={stepButtonClassName}
      >
        <GridNavPending>
          <ChevronLeft className="size-4" />
        </GridNavPending>
      </Link>
      <span className="truncate px-1 text-[11px] font-extrabold uppercase tracking-[0.2em] text-[var(--foreground)]">
        {dateLabel}
      </span>
      <Link
        href={nextHref}
        prefetch={false}
        onPointerEnter={() => warm(nextHref)}
        onFocus={() => warm(nextHref)}
        aria-label="Fecha siguiente"
        className={stepButtonClassName}
      >
        <GridNavPending>
          <ChevronRight className="size-4" />
        </GridNavPending>
      </Link>
    </div>
  );
}
