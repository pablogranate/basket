"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";

import type { PlanillaPerson, PlanillaRow } from "@/lib/grid/planilla";
import type { PlanillaStatus } from "@/lib/grid/planilla-sync";

// Univer draws on a canvas and weighs ~2 MB gzip: load it only here, only in
// the browser.
const GridPlanillaSheet = dynamic(
  () => import("@/components/grid/planilla/grid-planilla-sheet").then((mod) => mod.GridPlanillaSheet),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
        Cargando planilla…
      </div>
    ),
  },
);

type GridPlanillaProps = {
  rows: PlanillaRow[];
  people: PlanillaPerson[];
  leagues: string[];
  canEdit: boolean;
  year: number;
  timezone: string;
};

const timeFormat = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function SaveState({ status, canEdit }: { status: PlanillaStatus | null; canEdit: boolean }) {
  if (!canEdit) {
    return <span>Solo lectura</span>;
  }
  if (status?.saving) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Guardando…
      </span>
    );
  }
  if (status?.savedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[var(--ok)]">
        <Check className="size-3.5" aria-hidden />
        Guardado {timeFormat.format(status.savedAt)}
        {status.created ? ` · ${status.created} partido${status.created === 1 ? "" : "s"} nuevo${status.created === 1 ? "" : "s"}` : ""}
      </span>
    );
  }
  return <span>Los cambios se guardan solos.</span>;
}

export function GridPlanilla({ rows, people, leagues, canEdit, year, timezone }: GridPlanillaProps) {
  const [status, setStatus] = useState<PlanillaStatus | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted)]">
        <p>
          {rows.length} partidos.{" "}
          {canEdit
            ? "Para cargar uno nuevo, completá una fila vacía: Fecha, Hora, Local y Visitante."
            : null}
        </p>
        <SaveState status={status} canEdit={canEdit} />
      </div>

      {status?.issues.length ? (
        <ul
          className="space-y-1 rounded-[var(--panel-radius)] border border-[var(--warn-border)] bg-[var(--warn-soft)] px-4 py-3 text-sm text-[var(--foreground)]"
          aria-live="polite"
        >
          {status.issues.map((issue) => (
            <li key={issue.id} className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--warn)]" aria-hidden />
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="h-[calc(100vh-15rem)] min-h-[28rem] overflow-hidden rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]">
        <GridPlanillaSheet
          rows={rows}
          people={people}
          leagues={leagues}
          canEdit={canEdit}
          year={year}
          timezone={timezone}
          onStatus={setStatus}
        />
      </div>
    </div>
  );
}
