"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

import { DashboardNav } from "@/components/layout/dashboard-nav";
import type { AppRole } from "@/lib/database.types";

export function DashboardMobileNav({
  brand,
  role,
}: {
  brand: React.ReactNode;
  role: AppRole | null;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir navegación"
        aria-expanded={open}
        className="inline-flex size-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] transition hover:bg-[var(--background-soft)]"
      >
        <Menu className="size-5" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100]">
          <div
            className="absolute inset-0 bg-[rgba(7,18,43,0.55)] backdrop-blur-sm"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <aside
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-[#10203f] bg-[#07122b]"
            onClickCapture={(event) => {
              // Close as soon as any nav link is activated.
              if ((event.target as HTMLElement).closest("a")) {
                setOpen(false);
              }
            }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#10203f] px-6 py-7">
              {brand}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar navegación"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#1c3057] bg-[#0c1c3f] text-[#9eb0cc] transition hover:border-[#2a4474] hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="px-5 py-6">
              <DashboardNav role={role} />
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
