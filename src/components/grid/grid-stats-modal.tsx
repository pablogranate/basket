"use client";

import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { X } from "lucide-react";

import type { GridReportSummary } from "@/lib/grid/report-stats";
import { cn, ensureErrorMessage } from "@/lib/utils";

const TABS = [
  { key: "personas", label: "Personas" },
  { key: "equipos", label: "Equipos" },
  { key: "produccion", label: "Producción" },
  { key: "funciones", label: "Funciones" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const tableHeaderCellClass =
  "border-b border-[var(--border)] px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--n-400)]";
const tableCellClass =
  "border-b border-[var(--border)] px-3 py-2 font-semibold text-[var(--foreground)]";
const tableMutedCellClass =
  "border-b border-[var(--border)] px-3 py-2 text-right font-semibold text-[var(--muted)]";

function EmptyRangeNotice({ message }: { message: string }) {
  return (
    <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-5 text-sm font-semibold text-[var(--n-500)]">
      {message}
    </div>
  );
}

function PersonasTab({ summary }: { summary: GridReportSummary }) {
  const [search, setSearch] = useState("");

  if (!summary.personas.length) {
    return (
      <EmptyRangeNotice message="Sin personas asignadas en el rango seleccionado." />
    );
  }

  const term = search.trim().toLocaleLowerCase("es");
  const rows = term
    ? summary.personas.filter((person) =>
        person.fullName.toLocaleLowerCase("es").includes(term),
      )
    : summary.personas;

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar persona..."
        className="w-full rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none transition placeholder:text-[var(--n-400)] focus:border-[var(--accent-border)]"
      />
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className={tableHeaderCellClass}>Persona</th>
                <th className={cn(tableHeaderCellClass, "text-right")}>
                  Partidos
                </th>
                <th className={cn(tableHeaderCellClass, "text-right")}>
                  Asignaciones
                </th>
                <th className={tableHeaderCellClass}>Funciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((person) => (
                <tr key={person.id}>
                  <td className={tableCellClass}>{person.fullName}</td>
                  <td className={cn(tableCellClass, "text-right font-extrabold")}>
                    {person.matchCount}
                  </td>
                  <td className={tableMutedCellClass}>
                    {person.assignmentCount}
                  </td>
                  <td className={cn(tableCellClass, "text-xs text-[var(--n-500)]")}>
                    {person.roles.join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyRangeNotice message="Ninguna persona coincide con la búsqueda." />
      )}
    </div>
  );
}

function EquiposTab({ summary }: { summary: GridReportSummary }) {
  if (!summary.equipos.length) {
    return (
      <EmptyRangeNotice message="Sin equipos en el rango seleccionado." />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className={tableHeaderCellClass}>Equipo</th>
            <th className={cn(tableHeaderCellClass, "text-right")}>De local</th>
            <th className={cn(tableHeaderCellClass, "text-right")}>
              De visitante
            </th>
            <th className={cn(tableHeaderCellClass, "text-right")}>Total</th>
          </tr>
        </thead>
        <tbody>
          {summary.equipos.map((team) => (
            <tr key={team.team}>
              <td className={tableCellClass}>{team.team}</td>
              <td className={tableMutedCellClass}>{team.local}</td>
              <td className={tableMutedCellClass}>{team.visitante}</td>
              <td className={cn(tableCellClass, "text-right font-extrabold")}>
                {team.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProduccionTab({ summary }: { summary: GridReportSummary }) {
  if (!summary.produccion.length) {
    return (
      <EmptyRangeNotice message="Sin producciones en el rango seleccionado." />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className={tableHeaderCellClass}>Producción</th>
            <th className={cn(tableHeaderCellClass, "text-right")}>Partidos</th>
          </tr>
        </thead>
        <tbody>
          {summary.produccion.map((entry) => (
            <tr key={entry.mode}>
              <td className={tableCellClass}>{entry.mode}</td>
              <td className={cn(tableCellClass, "text-right font-extrabold")}>
                {entry.count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FuncionesTab({ summary }: { summary: GridReportSummary }) {
  if (!summary.funciones.categories.length) {
    return (
      <EmptyRangeNotice message="Sin asignaciones en el rango seleccionado." />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-left text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--n-400)]">
            <th className="border-b border-[var(--border)] px-3 py-2">
              Función
            </th>
            <th className="border-b border-[var(--border)] px-3 py-2 text-right">
              Asignaciones
            </th>
          </tr>
        </thead>
        <tbody>
          {summary.funciones.categories.map((category) => (
            <Fragment key={category.category}>
              <tr className="bg-[var(--background-soft)]">
                <td className="border-b border-[var(--border)] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--n-600)]">
                  {category.category}
                </td>
                <td className="border-b border-[var(--border)] px-3 py-2 text-right text-sm font-extrabold text-[var(--foreground)]">
                  {category.total}
                </td>
              </tr>
              {category.roles.map((role) => (
                <tr key={`${category.category}-${role.name}`}>
                  <td className="border-b border-[var(--border)] px-3 py-2 pl-6 font-semibold text-[var(--foreground)]">
                    {role.name}
                  </td>
                  <td className="border-b border-[var(--border)] px-3 py-2 text-right font-semibold text-[var(--muted)]">
                    {role.count}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GridStatsModal({
  timezone,
  onClose,
}: {
  timezone: string;
  onClose: () => void;
}) {
  const today = new Date();
  const [from, setFrom] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfMonth(today), "yyyy-MM-dd"));
  const [activeTab, setActiveTab] = useState<TabKey>("personas");
  const [retryCount, setRetryCount] = useState(0);
  // Result is keyed by the request that produced it; a key mismatch with the
  // current range means a fetch is in flight (no sync setState in effects).
  const [result, setResult] = useState<{
    key: string;
    summary: GridReportSummary | null;
    error: string | null;
  } | null>(null);

  const hasValidRange = Boolean(from && to && from <= to);
  const requestKey = `${from}|${to}|${timezone}|${retryCount}`;

  useEffect(() => {
    if (!hasValidRange) {
      return;
    }

    let cancelled = false;

    async function loadSummary() {
      try {
        const params = new URLSearchParams({ from, to, timezone });
        const response = await fetch(`/api/grid/reports?${params.toString()}`);
        const payload = (await response.json()) as {
          summary?: GridReportSummary;
          error?: string;
        };

        if (!response.ok || !payload.summary) {
          throw new Error(payload.error || "No se pudo cargar el resumen.");
        }

        if (!cancelled) {
          setResult({ key: requestKey, summary: payload.summary, error: null });
        }
      } catch (caught) {
        if (!cancelled) {
          setResult({
            key: requestKey,
            summary: null,
            error: ensureErrorMessage(caught),
          });
        }
      }
    }

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, [hasValidRange, requestKey, from, to, timezone]);

  const isLoading = hasValidRange && result?.key !== requestKey;
  const summary = result?.key === requestKey ? result.summary : null;
  const error = result?.key === requestKey ? result.error : null;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const rangeInputClass =
    "rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none transition focus:border-[var(--accent-border)]";

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-start justify-center bg-[rgba(28,13,16,0.48)] px-4 py-8 backdrop-blur-sm">
      <div className="absolute inset-0" aria-hidden="true" onClick={onClose} />
      <div className="relative z-[1] flex max-h-[calc(100vh-4rem)] w-full max-w-[720px] flex-col overflow-hidden rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lift)]">
        <div className="flex items-start justify-between gap-6 border-b border-[var(--border)] px-7 py-6">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--n-400)]">
              Producción
            </p>
            <h2 className="text-xl font-extrabold tracking-tight text-[var(--foreground)]">
              Estadísticas
            </h2>
          </div>
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background-soft)] text-[var(--muted)] transition hover:text-[var(--foreground)]"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X className="size-4.5" />
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-4 border-b border-[var(--border)] px-7 py-4">
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--n-400)]">
            Desde
            <input
              type="date"
              value={from}
              max={to}
              onChange={(event) => setFrom(event.target.value)}
              className={rangeInputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--n-400)]">
            Hasta
            <input
              type="date"
              value={to}
              min={from}
              onChange={(event) => setTo(event.target.value)}
              className={rangeInputClass}
            />
          </label>
          {summary && !isLoading ? (
            <span className="pb-2 text-sm font-semibold text-[var(--muted)]">
              {summary.matchCount} partidos en el rango
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-b border-[var(--border)] px-7 py-3">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "rounded-full border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition",
                activeTab === tab.key
                  ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--border)] bg-[var(--background-soft)] text-[var(--n-600)] hover:text-[var(--accent)]",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          {isLoading ? (
            <div className="space-y-3" aria-busy="true">
              {[0, 1, 2, 3].map((key) => (
                <div
                  key={key}
                  className="h-10 animate-pulse rounded-[var(--panel-radius)] bg-[var(--background-soft)]"
                />
              ))}
            </div>
          ) : error ? (
            <div className="space-y-4 rounded-[var(--panel-radius)] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-5 py-5 text-sm font-semibold text-[var(--accent-strong)]">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => setRetryCount((count) => count + 1)}
                className="inline-flex items-center rounded-full border border-[var(--accent-border)] bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-strong)] transition hover:brightness-105"
              >
                Reintentar
              </button>
            </div>
          ) : summary && summary.matchCount === 0 ? (
            <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-5 text-sm font-semibold text-[var(--n-500)]">
              No hay partidos en el rango seleccionado.
            </div>
          ) : summary ? (
            activeTab === "personas" ? (
              <PersonasTab summary={summary} />
            ) : activeTab === "equipos" ? (
              <EquiposTab summary={summary} />
            ) : activeTab === "produccion" ? (
              <ProduccionTab summary={summary} />
            ) : (
              <FuncionesTab summary={summary} />
            )
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
