"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, ArrowUpRight, Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  PlanillaControls,
  PlanillaDeleteOutcome,
} from "@/components/grid/planilla/grid-planilla-sheet";
import type { PlanillaPerson, PlanillaRow } from "@/lib/grid/planilla";
import type { PlanillaRowMatch, PlanillaStatus } from "@/lib/grid/planilla-sync";

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
  columnOrderKey: string;
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

function DeleteDialog({
  matches,
  onCancel,
  onConfirm,
}: {
  matches: PlanillaRowMatch[];
  onCancel: () => void;
  onConfirm: () => Promise<PlanillaDeleteOutcome>;
}) {
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<PlanillaDeleteOutcome["failed"]>([]);
  const [isDeleting, startDeleting] = useTransition();
  const count = matches.length;
  const shown = matches.slice(0, 8);
  const done = failed.length > 0;
  const deletedCount = count - failed.length;

  function cancel() {
    if (!isDeleting) {
      onCancel();
    }
  }

  function confirm() {
    startDeleting(async () => {
      const outcome = await onConfirm();
      setError(outcome.error ?? "");
      setFailed(outcome.failed);
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-[var(--n-900)]/60 p-4 backdrop-blur-sm"
      onClick={cancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="Borrar partidos"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            cancel();
          }
        }}
        className="panel-surface relative flex w-full max-w-md flex-col gap-3 border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-lift)]"
      >
        {done ? (
          <>
            <p className="text-base font-semibold text-[var(--foreground)]">
              {failed.length === 1 ? "Un partido no se borró" : `${failed.length} partidos no se borraron`}
            </p>
            {deletedCount > 0 ? (
              <p className="text-sm text-[var(--muted)]">
                {deletedCount === 1 ? "El otro se borró." : `Los otros ${deletedCount} se borraron.`}
              </p>
            ) : null}
            <ul className="max-h-60 space-y-2 overflow-y-auto text-sm">
              {failed.map(({ match, error: reason }) => (
                <li key={match.matchId}>
                  <span className="block truncate text-[var(--foreground)]">{match.label}</span>
                  <span className="text-[var(--accent)]">{reason}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex justify-end">
              <Button onClick={onCancel} autoFocus>
                Cerrar
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-base font-semibold text-[var(--foreground)]">
              ¿Borrar {count === 1 ? "este partido" : `estos ${count} partidos`}?
            </p>
            <p className="text-sm text-[var(--muted)]">
              Se borran de verdad, con sus asignaciones, en la grilla y en todo el portal. No se
              puede deshacer. Los que tienen incidencias cargadas no se borran.
            </p>
            <ul className="max-h-48 space-y-1 overflow-y-auto text-sm text-[var(--foreground)]">
              {shown.map((match) => (
                <li key={match.matchId} className="truncate">
                  {match.label}
                </li>
              ))}
              {count > shown.length ? (
                <li className="text-[var(--muted)]">y {count - shown.length} más</li>
              ) : null}
            </ul>
            {error ? <p className="text-sm text-[var(--accent)]">{error}</p> : null}
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="secondary" onClick={cancel} disabled={isDeleting}>
                Cancelar
              </Button>
              <Button onClick={confirm} disabled={isDeleting} autoFocus>
                {isDeleting ? "Borrando…" : count === 1 ? "Borrar partido" : `Borrar ${count} partidos`}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function resetColumns(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing stored.
  }
  window.location.reload();
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
  columnOrderKey,
}: GridPlanillaProps) {
  const [status, setStatus] = useState<PlanillaStatus | null>(null);
  const [toDelete, setToDelete] = useState<PlanillaRowMatch[] | null>(null);
  const [columnsCustomized, setColumnsCustomized] = useState(false);
  const [activeMatch, setActiveMatch] = useState<PlanillaRowMatch | null>(null);
  const controls = useRef<PlanillaControls | null>(null);
  const bulk = status?.bulk ?? null;

  return (
    <div className="space-y-3">
      <div className="flex h-6 items-center justify-between gap-4 text-sm text-[var(--muted)]">
        {activeMatch ? (
          <Link
            href={`/match/${activeMatch.matchId}`}
            className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-[var(--foreground)] hover:text-[var(--accent)]"
          >
            <span className="truncate">Abrir ficha · {activeMatch.label}</span>
            <ArrowUpRight className="size-4 shrink-0" aria-hidden />
          </Link>
        ) : (
          <p className="min-w-0 truncate">
            {rows.length} partidos.{" "}
            {canEdit
              ? "Para cargar uno nuevo, completá una fila vacía. Para borrar, seleccioná las filas y apretá Supr."
              : null}
          </p>
        )}
        <div className="flex min-w-0 max-w-[60%] items-center justify-end gap-4">
          <Issues status={status} />
          {columnsCustomized ? (
            <button
              type="button"
              onClick={() => resetColumns(columnOrderKey)}
              className="shrink-0 font-semibold hover:text-[var(--foreground)]"
            >
              Orden original
            </button>
          ) : null}
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
          columnOrderKey={columnOrderKey}
          onStatus={setStatus}
          onDeleteRequest={setToDelete}
          onColumnsCustomized={setColumnsCustomized}
          onActiveMatch={setActiveMatch}
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

      {toDelete ? (
        <DeleteDialog
          matches={toDelete}
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            const outcome = (await controls.current?.deleteMatches(toDelete)) ?? {
              failed: [],
              error: "La planilla no está lista.",
            };
            if (!outcome.error && !outcome.failed.length) {
              setToDelete(null);
            }
            return outcome;
          }}
        />
      ) : null}
    </div>
  );
}
