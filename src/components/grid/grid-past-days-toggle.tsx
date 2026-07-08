"use client";

import { type ReactNode } from "react";
import { History } from "lucide-react";

import { cn } from "@/lib/utils";
import { useGridPastDays } from "@/components/grid/grid-past-days-context";

// Toggle button for the past-day cards. Rendered twice — once in the desktop
// toolbar's left column, once (mobile-only) inside the content — both driving
// the same shared state via `useGridPastDays`.
export function GridPastDaysButton({
  count,
  // Optional control rendered beside the toggle; the grid mobile nav parks the
  // date-order sort button here (sort is only meaningful across multiple days).
  accessory,
  className,
}: {
  count: number;
  accessory?: ReactNode;
  className?: string;
}) {
  const context = useGridPastDays();
  const open = context?.open ?? false;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        type="button"
        onClick={() => context?.toggle()}
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--muted)] shadow-[var(--shadow-rest)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent)]",
          open && "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]",
        )}
      >
        <History className="size-4" />
        {open
          ? "Ocultar días anteriores"
          : `Ver días anteriores (${count})`}
      </button>
      {accessory}
    </div>
  );
}

// Past-day cards are deferred: their server-rendered nodes are passed as
// `children` but only committed to the DOM once expanded, so the browser never
// builds/paints the (expensive) past match cards on the initial month render.
export function GridPastDaysPanel({ children }: { children: ReactNode }) {
  const context = useGridPastDays();
  const open = context?.open ?? false;

  return open ? <div className="space-y-10">{children}</div> : null;
}
