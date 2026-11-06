"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PlanillaControls } from "@/components/grid/planilla/grid-planilla-sheet";
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
  teams: string[];
  canEdit: boolean;
  year: number;
  timezone: string;
  todayKey: string;
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
      </span>
    );
  }
  return <span>Los cambios se guardan solos.</span>;
}

// Notices sit on one fixed line and open as an overlay: anything that pushes
// the sheet down moves the cell under the user's cursor.
function Issues({ status }: { status: PlanillaStatus | null }) {
  const [open, setOpen] = useState(false);
  const issues = status?.issues ?? [];

  if (!issues.length) {
    return null;
  }

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex max-w-full min-w-0 items-center gap-1.5 overflow-hidden text-[var(--warn)] hover:underline"
      >
        <AlertCircle className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{issues[0].message}</span>
        {issues.length > 1 ? <span className="shrink-0">(+{issues.length - 1})</span> : null}
      </button>
      {open ? (
        <ul
          className="absolute right-0 top-full z-20 mt-2 w-[32rem] max-w-[90vw] space-y-1.5 rounded-[var(--panel-radius)] border border-[var(--warn-border)] bg-[var(--warn-soft)] px-4 py-3 text-[var(--foreground)] shadow-[var(--shadow-lift)]"
          aria-live="polite"
        >
          {issues.map((issue) => (
            <li key={issue.id}>{issue.message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function GridPlanilla({
  rows,
  people,
  leagues,
  teams,
  canEdit,
  year,
  timezone,
  todayKey,
}: GridPlanillaProps) {
  const [status, setStatus] = useState<PlanillaStatus | null>(null);
  const controls = useRef<PlanillaControls | null>(null);
  const bulk = status?.bulk ?? null;

  return (
    <div className="space-y-3">
      <div className="flex h-6 items-center justify-between gap-4 text-sm text-[var(--muted)]">
        <p className="min-w-0 truncate">
          {rows.length} partidos.{" "}
          {canEdit ? "Para cargar uno nuevo, completá una fila vacía: Fecha, Hora, Local y Visitante." : null}
        </p>
        <div className="flex min-w-0 max-w-[60%] items-center justify-end gap-4">
          <Issues status={status} />
          <span className="shrink-0">
            <SaveState status={status} canEdit={canEdit} />
          </span>
        </div>
      </div>

      <div className="relative h-[calc(100vh-19rem)] min-h-[28rem] overflow-hidden rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]">
        <GridPlanillaSheet
          rows={rows}
          people={people}
          leagues={leagues}
          teams={teams}
          canEdit={canEdit}
          year={year}
          timezone={timezone}
          todayKey={todayKey}
          onStatus={setStatus}
          onControls={(value) => {
            controls.current = value;
          }}
        />
        {bulk ? (
          <div
            role="alertdialog"
            aria-label="Confirmar cambios"
            className="absolute inset-x-0 top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--warn-border)] bg-[var(--warn-soft)] px-4 py-3 text-sm text-[var(--foreground)] shadow-[var(--shadow-lift)]"
          >
            <span>
              Vas a cambiar <strong>{bulk.cells} celdas</strong> en {bulk.partidos} partido
              {bulk.partidos === 1 ? "" : "s"}. No se guarda nada hasta que confirmes.
            </span>
            <span className="flex gap-2">
              <Button variant="secondary" onClick={() => controls.current?.discardBulk()}>
                Deshacer
              </Button>
              <Button onClick={() => controls.current?.confirmBulk()}>Guardar cambios</Button>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
