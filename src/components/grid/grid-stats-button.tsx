"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";

import { GridStatsModal } from "@/components/grid/grid-stats-modal-lazy";

export function GridStatsButton({ timezone }: { timezone: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Estadísticas de producción"
        title="Estadísticas de producción"
        className="inline-flex size-[52px] items-center justify-center rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)] shadow-[var(--shadow-rest)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent-strong)]"
      >
        <BarChart3 className="size-4" />
      </button>
      {isOpen ? (
        <GridStatsModal timezone={timezone} onClose={() => setIsOpen(false)} />
      ) : null}
    </>
  );
}
