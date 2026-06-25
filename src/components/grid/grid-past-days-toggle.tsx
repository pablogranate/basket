"use client";

import { useState, type ReactNode } from "react";
import { History } from "lucide-react";

import { cn } from "@/lib/utils";

// Past-day cards are deferred: their server-rendered nodes are passed as
// `children` but only committed to the DOM once expanded, so the browser never
// builds/paints the (expensive) past match cards on the initial month render.
export function GridPastDaysToggle({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-10">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
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
      {open ? <div className="space-y-10">{children}</div> : null}
    </div>
  );
}
