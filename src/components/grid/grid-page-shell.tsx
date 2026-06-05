"use client";

import { useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

import { cn } from "@/lib/utils";

const SUMMARY_COLLAPSED_STORAGE_KEY =
  "basket-production.grid.summary-collapsed.v1";

type GridPageShellProps = {
  children: React.ReactNode;
  aside: React.ReactNode;
};

export function GridPageShell({ children, aside }: GridPageShellProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return (
      window.localStorage.getItem(SUMMARY_COLLAPSED_STORAGE_KEY) === "true"
    );
  });

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SUMMARY_COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  }

  const toggleButtonClassName =
    "inline-flex size-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[#7f8ca0] shadow-[0_8px_18px_rgba(15,23,42,0.06)] transition hover:border-[rgba(230,18,56,0.24)] hover:text-[var(--accent)]";

  return (
    <div
      className={cn(
        "grid gap-6",
        collapsed
          ? "xl:grid-cols-[minmax(0,1fr)_2.75rem]"
          : "xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]",
      )}
    >
      <div className="relative z-0 min-w-0 space-y-10">{children}</div>

      <aside className="relative z-20 min-w-0 self-start xl:sticky xl:top-24">
        {collapsed ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Mostrar resumen"
            title="Mostrar resumen"
            className={toggleButtonClassName}
          >
            <PanelRightOpen className="size-4" />
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label="Compactar resumen"
                title="Compactar resumen"
                className={toggleButtonClassName}
              >
                <PanelRightClose className="size-4" />
              </button>
            </div>
            {aside}
          </div>
        )}
      </aside>
    </div>
  );
}
