"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { endOfMonth, format, startOfMonth } from "date-fns";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  FileText,
  Filter,
  ListChecks,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import {
  ALL_STATS_TABS,
  buildAllStatsFileBaseName,
  buildPersonDetailExportTable,
  buildPersonDetailFileBaseName,
  buildStatsCsv,
  buildStatsExportTable,
  buildStatsFileBaseName,
  downloadStatsBlob,
  exportAllStatsPdf,
  exportStatsPdf,
} from "@/components/grid/grid-stats-export";
import { formatMatchDateTime } from "@/lib/date";
import {
  buildFacetCounts,
  buildGridReportSummary,
  buildPersonDetail,
  EMPTY_REPORT_FILTERS,
  filterMatches,
  UNSPECIFIED_PRODUCTION_MODE,
} from "@/lib/grid/report-stats";
import type {
  GridReportSummary,
  ReportFacetCounts,
  ReportFilters,
  ReportMatchRow,
  ReportPersonCount,
  ReportPersonDetail,
  ReportProductionCount,
  ReportTeamCount,
} from "@/lib/grid/report-stats";
import { cn, ensureErrorMessage } from "@/lib/utils";

const TABS = [
  { key: "personas", label: "Personas" },
  { key: "equipos", label: "Equipos" },
  { key: "produccion", label: "Producción" },
  { key: "funciones", label: "Funciones" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

type FilterDimension = keyof ReportFilters;

const FILTER_GROUPS: ReadonlyArray<{
  key: FilterDimension;
  label: string;
  hasMiniSearch: boolean;
}> = [
  { key: "ligas", label: "Liga", hasMiniSearch: false },
  { key: "teams", label: "Equipos", hasMiniSearch: true },
  { key: "modes", label: "Producción", hasMiniSearch: false },
  { key: "roles", label: "Funciones", hasMiniSearch: false },
];

type SortOption = "count" | "alpha";
type MetricOption = "partidos" | "asignaciones";

type DisplayOptions = {
  sort: SortOption;
  metric: MetricOption;
  rivales: boolean;
  sinEsp: boolean;
};

const DEFAULT_DISPLAY: DisplayOptions = {
  sort: "count",
  metric: "partidos",
  rivales: true,
  sinEsp: true,
};

const EMPTY_FACETS: ReportFacetCounts = {
  ligas: [],
  teams: [],
  modes: [],
  roles: [],
};

const tableHeaderCellClass =
  "border-b border-[var(--border)] px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--n-400)]";
const tableCellClass =
  "border-b border-[var(--border)] px-3 py-2 font-semibold text-[var(--foreground)]";
const tableMutedCellClass =
  "border-b border-[var(--border)] px-3 py-2 text-right font-semibold text-[var(--muted)]";

// Display transforms (handoff §5): view-only reordering/filtering applied on
// top of the pure, count-based summary. Kept out of report-stats so the builders
// stay stable and the exports can reuse the exact rows the user sees.
function sortPersonas(
  personas: ReportPersonCount[],
  display: DisplayOptions,
): ReportPersonCount[] {
  return personas.slice().sort((left, right) => {
    if (display.sort === "alpha") {
      return left.fullName.localeCompare(right.fullName, "es");
    }
    const primary =
      display.metric === "asignaciones"
        ? right.assignmentCount - left.assignmentCount
        : right.matchCount - left.matchCount;
    return primary || left.fullName.localeCompare(right.fullName, "es");
  });
}

function transformEquipos(
  equipos: ReportTeamCount[],
  display: DisplayOptions,
  filters: ReportFilters,
): ReportTeamCount[] {
  let rows = equipos;
  if (!display.rivales && filters.teams.length) {
    const selected = new Set(filters.teams);
    rows = rows.filter((team) => selected.has(team.team));
  }
  return rows.slice().sort((left, right) => {
    if (display.sort === "alpha") {
      return left.team.localeCompare(right.team, "es");
    }
    return right.total - left.total || left.team.localeCompare(right.team, "es");
  });
}

function transformProduccion(
  produccion: ReportProductionCount[],
  display: DisplayOptions,
): ReportProductionCount[] {
  let rows = produccion;
  if (!display.sinEsp) {
    rows = rows.filter((entry) => entry.mode !== UNSPECIFIED_PRODUCTION_MODE);
  }
  return rows.slice().sort((left, right) => {
    if (display.sort === "alpha") {
      return left.mode.localeCompare(right.mode, "es");
    }
    return right.count - left.count || left.mode.localeCompare(right.mode, "es");
  });
}

function transformFunciones(
  funciones: GridReportSummary["funciones"],
  display: DisplayOptions,
): GridReportSummary["funciones"] {
  return {
    total: funciones.total,
    categories: funciones.categories.map((category) => ({
      ...category,
      roles: category.roles.slice().sort((left, right) => {
        if (display.sort === "alpha") {
          return left.name.localeCompare(right.name, "es");
        }
        return (
          right.count - left.count || left.name.localeCompare(right.name, "es")
        );
      }),
    })),
  };
}

function EmptyRangeNotice({ message }: { message: string }) {
  return (
    <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)] px-4 py-5 text-sm font-semibold text-[var(--n-500)]">
      {message}
    </div>
  );
}

function FilterSidebar({
  facets,
  filters,
  closedGroups,
  teamSearch,
  activeCount,
  onToggleOption,
  onToggleGroup,
  onTeamSearch,
  onClearAll,
}: {
  facets: ReportFacetCounts;
  filters: ReportFilters;
  closedGroups: Record<FilterDimension, boolean>;
  teamSearch: string;
  activeCount: number;
  onToggleOption: (dim: FilterDimension, value: string) => void;
  onToggleGroup: (dim: FilterDimension) => void;
  onTeamSearch: (value: string) => void;
  onClearAll: () => void;
}) {
  return (
    <aside className="flex w-[248px] flex-none flex-col border-r border-[var(--border)] bg-[var(--surface-muted)]">
      <div className="sticky top-0 z-[2] flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 pb-3 pt-4">
        <span className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--n-700)]">
          <Filter className="size-[15px]" />
          Filtros
          {activeCount ? (
            <span className="grid h-[17px] min-w-[17px] place-items-center rounded-full bg-[var(--accent)] px-[5px] text-[10px] font-extrabold tabular-nums text-white">
              {activeCount}
            </span>
          ) : null}
        </span>
        {activeCount ? (
          <button
            type="button"
            onClick={onClearAll}
            className="px-1 py-1 text-[11.5px] font-bold text-[var(--accent)] transition hover:text-[var(--accent-strong)] hover:underline"
          >
            Limpiar todo
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3.5 pt-1.5">
        {FILTER_GROUPS.map((group) => {
          const closed = closedGroups[group.key];
          const groupActive = filters[group.key].length;
          let options = facets[group.key];
          if (group.hasMiniSearch && teamSearch.trim()) {
            const term = teamSearch.trim().toLocaleLowerCase("es");
            options = options.filter((option) =>
              option.value.toLocaleLowerCase("es").includes(term),
            );
          }

          return (
            <div
              key={group.key}
              className="border-t border-[var(--border)] px-1 py-2.5 first:border-t-0"
            >
              <button
                type="button"
                onClick={() => onToggleGroup(group.key)}
                className="flex w-full items-center gap-2 px-1 pb-2 pt-1 text-[var(--n-500)]"
              >
                <span className="text-[10.5px] font-extrabold uppercase tracking-[0.14em]">
                  {group.label}
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  {groupActive ? (
                    <span className="grid h-4 min-w-[16px] place-items-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-1 text-[10px] font-extrabold tabular-nums text-[var(--accent-strong)]">
                      {groupActive}
                    </span>
                  ) : null}
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      closed && "-rotate-90",
                    )}
                  />
                </span>
              </button>

              {closed ? null : (
                <>
                  {group.hasMiniSearch ? (
                    <div className="mx-0.5 mb-1.5">
                      <input
                        type="text"
                        value={teamSearch}
                        onChange={(event) => onTeamSearch(event.target.value)}
                        placeholder="Buscar equipo..."
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent-border)]"
                      />
                    </div>
                  ) : null}
                  <div className="space-y-0.5">
                    {options.length ? (
                      options.map((option) => {
                        const selected = filters[group.key].includes(
                          option.value,
                        );
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                              onToggleOption(group.key, option.value)
                            }
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[12.5px] font-semibold text-[var(--n-800)] transition hover:bg-[var(--background-soft)]",
                              selected && "bg-[var(--accent-soft)]",
                              !selected && option.count === 0 && "opacity-40",
                            )}
                          >
                            <span
                              className={cn(
                                "grid size-[15px] flex-none place-items-center rounded-[5px] border",
                                selected
                                  ? "border-[var(--accent)] bg-[var(--accent)]"
                                  : "border-[var(--n-300)] bg-[var(--surface)]",
                              )}
                            >
                              {selected ? (
                                <Check
                                  className="size-2.5 text-white"
                                  strokeWidth={3.5}
                                />
                              ) : null}
                            </span>
                            <span className="min-w-0 flex-1 truncate">
                              {option.value}
                            </span>
                            <span
                              className={cn(
                                "ml-auto text-[10.5px] tabular-nums",
                                selected
                                  ? "text-[var(--accent-strong)]"
                                  : "text-[var(--n-400)]",
                              )}
                            >
                              {option.count}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-2 py-1.5 text-[12.5px] font-semibold text-[var(--n-400)] opacity-60">
                        Sin coincidencias
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function PersonasTab({
  personas,
  metric,
  search,
  onSearch,
  onSelectPerson,
}: {
  personas: ReportPersonCount[];
  metric: MetricOption;
  search: string;
  onSearch: (value: string) => void;
  onSelectPerson: (person: { id: string; fullName: string }) => void;
}) {
  const term = search.trim().toLocaleLowerCase("es");
  const rows = term
    ? personas.filter((person) =>
        person.fullName.toLocaleLowerCase("es").includes(term),
      )
    : personas;

  const primaryLabel = metric === "asignaciones" ? "Asignaciones" : "Partidos";
  const secondaryLabel = metric === "asignaciones" ? "Partidos" : "Asignaciones";

  return (
    <div className="space-y-4">
      <div className="relative max-w-[340px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-[15px] -translate-y-1/2 text-[var(--n-400)]" />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Buscar persona..."
          className="w-full rounded-full border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-9 pr-4 text-sm font-semibold text-[var(--foreground)] outline-none transition placeholder:text-[var(--n-400)] focus:border-[var(--accent-border)]"
        />
      </div>
      {personas.length === 0 ? (
        <EmptyRangeNotice message="Sin personas asignadas con los filtros actuales." />
      ) : rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className={tableHeaderCellClass}>Persona</th>
                <th className={cn(tableHeaderCellClass, "text-right")}>
                  {primaryLabel}
                </th>
                <th className={cn(tableHeaderCellClass, "text-right")}>
                  {secondaryLabel}
                </th>
                <th className={tableHeaderCellClass}>Funciones</th>
                <th className={cn(tableHeaderCellClass, "text-right")}>
                  Detalle
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((person) => {
                const primaryValue =
                  metric === "asignaciones"
                    ? person.assignmentCount
                    : person.matchCount;
                const secondaryValue =
                  metric === "asignaciones"
                    ? person.matchCount
                    : person.assignmentCount;
                return (
                  <tr key={person.id}>
                    <td className={tableCellClass}>{person.fullName}</td>
                    <td
                      className={cn(
                        tableCellClass,
                        "text-right font-extrabold",
                      )}
                    >
                      {primaryValue}
                    </td>
                    <td className={tableMutedCellClass}>{secondaryValue}</td>
                    <td
                      className={cn(
                        tableCellClass,
                        "text-xs text-[var(--n-500)]",
                      )}
                    >
                      {person.roles.join(" · ")}
                    </td>
                    <td className="border-b border-[var(--border)] px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          onSelectPerson({
                            id: person.id,
                            fullName: person.fullName,
                          })
                        }
                        aria-label={`Ver detalle de ${person.fullName}`}
                        title="Ver partidos asignados"
                        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--background-soft)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--n-600)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent)]"
                      >
                        <ListChecks className="size-3.5" />
                        Ver
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyRangeNotice message="Ninguna persona coincide con la búsqueda." />
      )}
    </div>
  );
}

function EquiposTab({ equipos }: { equipos: ReportTeamCount[] }) {
  if (!equipos.length) {
    return <EmptyRangeNotice message="Sin equipos con los filtros actuales." />;
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
          {equipos.map((team) => (
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

function ProduccionTab({
  produccion,
}: {
  produccion: ReportProductionCount[];
}) {
  if (!produccion.length) {
    return (
      <EmptyRangeNotice message="Sin producciones con los filtros actuales." />
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
          {produccion.map((entry) => (
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

function FuncionesTab({
  funciones,
}: {
  funciones: GridReportSummary["funciones"];
}) {
  if (!funciones.categories.length) {
    return (
      <EmptyRangeNotice message="Sin asignaciones con los filtros actuales." />
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
          {funciones.categories.map((category) => (
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

function PersonDetailPanel({
  detail,
  fullName,
  isFiltered,
  timezone,
  rangeLabel,
  from,
  to,
  onBack,
  iconButtonClass,
}: {
  detail: ReportPersonDetail | null;
  fullName: string;
  isFiltered: boolean;
  timezone: string;
  rangeLabel: string;
  from: string;
  to: string;
  onBack: () => void;
  iconButtonClass: string;
}) {
  const canExport = Boolean(detail && detail.matches.length);

  function handleCsvExport() {
    if (!detail) {
      return;
    }

    const table = buildPersonDetailExportTable(detail, timezone);
    downloadStatsBlob(
      new Blob([buildStatsCsv(table)], { type: "text/csv;charset=utf-8" }),
      `${buildPersonDetailFileBaseName({ fullName: detail.fullName, from, to })}.csv`,
    );
  }

  async function handlePdfExport() {
    if (!detail) {
      return;
    }

    const table = buildPersonDetailExportTable(detail, timezone);
    await exportStatsPdf({
      table,
      rangeLabel,
      fileBaseName: buildPersonDetailFileBaseName({
        fullName: detail.fullName,
        from,
        to,
      }),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver a Personas"
            title="Volver a Personas"
            className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background-soft)] text-[var(--muted)] transition hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--n-400)]">
              Detalle por persona{isFiltered ? " · filtrado" : ""}
            </p>
            <h3 className="truncate text-base font-extrabold tracking-tight text-[var(--foreground)]">
              {fullName}
            </h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCsvExport}
            disabled={!canExport}
            aria-label="Exportar CSV"
            title="Exportar CSV"
            className={iconButtonClass}
          >
            <Download className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => void handlePdfExport()}
            disabled={!canExport}
            aria-label="Exportar PDF"
            title="Exportar PDF"
            className={iconButtonClass}
          >
            <FileText className="size-4" />
          </button>
        </div>
      </div>

      {detail && detail.matches.length ? (
        <>
          <p className="text-sm font-semibold text-[var(--muted)]">
            {detail.matchCount} partidos · {detail.assignmentCount} asignaciones
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className={tableHeaderCellClass}>Fecha</th>
                  <th className={tableHeaderCellClass}>Local</th>
                  <th className={tableHeaderCellClass}>Visitante</th>
                  <th className={tableHeaderCellClass}>Producción</th>
                  <th className={tableHeaderCellClass}>Función</th>
                </tr>
              </thead>
              <tbody>
                {detail.matches.map((match) => (
                  <tr key={match.id}>
                    <td className={cn(tableCellClass, "whitespace-nowrap")}>
                      {formatMatchDateTime(match.kickoffAt, timezone)}
                    </td>
                    <td className={tableCellClass}>{match.homeTeam}</td>
                    <td className={tableCellClass}>{match.awayTeam}</td>
                    <td className={cn(tableCellClass, "text-[var(--muted)]")}>
                      {match.productionMode?.trim() ||
                        UNSPECIFIED_PRODUCTION_MODE}
                    </td>
                    <td
                      className={cn(
                        tableCellClass,
                        "text-xs text-[var(--n-500)]",
                      )}
                    >
                      {match.roles.join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <EmptyRangeNotice message="Sin partidos asignados con los filtros actuales." />
      )}
    </div>
  );
}

function SegmentedControl<Value extends string>({
  value,
  options,
  onChange,
}: {
  value: Value;
  options: ReadonlyArray<{ value: Value; label: string; disabled?: boolean }>;
  onChange: (value: Value) => void;
}) {
  return (
    <div className="flex rounded-lg border border-[var(--border)] bg-[var(--background-soft)] p-[3px]">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex-1 rounded-md px-2 py-1.5 text-xs font-bold transition",
            value === option.value
              ? "bg-[var(--surface)] text-[var(--accent-strong)] shadow-[var(--shadow-rest)]"
              : "text-[var(--n-600)]",
            option.disabled && "cursor-not-allowed opacity-40",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-0.5 pb-0.5 pt-2 text-sm font-semibold">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onToggle}
        className={cn(
          "relative h-[22px] w-[38px] flex-none rounded-full transition-colors",
          checked ? "bg-[var(--accent)]" : "bg-[var(--n-300)]",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] size-[18px] rounded-full bg-white shadow-[var(--shadow-rest)] transition-[left]",
            checked ? "left-[18px]" : "left-[2px]",
          )}
        />
      </button>
    </div>
  );
}

const menuHeadingClass =
  "mx-0.5 mb-2 mt-0.5 text-[10px] font-extrabold uppercase tracking-[0.15em] text-[var(--n-400)] [&:not(:first-child)]:mt-3";

const menuClass =
  "absolute right-0 top-[calc(100%+6px)] z-40 min-w-[248px] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 shadow-[var(--shadow-lift)]";

function OpcionesMenu({
  tab,
  display,
  onChange,
}: {
  tab: TabKey;
  display: DisplayOptions;
  onChange: (next: Partial<DisplayOptions>) => void;
}) {
  return (
    <div className={menuClass}>
      <h4 className={menuHeadingClass}>Orden</h4>
      <SegmentedControl
        value={display.sort}
        options={[
          { value: "count", label: "Por cantidad" },
          { value: "alpha", label: "Alfabético" },
        ]}
        onChange={(sort) => onChange({ sort })}
      />

      {tab === "personas" ? (
        <>
          <h4 className={menuHeadingClass}>Métrica principal</h4>
          <SegmentedControl
            value={display.metric}
            options={[
              { value: "partidos", label: "Partidos" },
              { value: "asignaciones", label: "Asignaciones" },
            ]}
            onChange={(metric) => onChange({ metric })}
          />
        </>
      ) : null}

      {tab === "equipos" ? (
        <ToggleRow
          label="Incluir rivales"
          checked={display.rivales}
          onToggle={() => onChange({ rivales: !display.rivales })}
        />
      ) : null}

      {tab === "produccion" ? (
        <ToggleRow
          label={'Mostrar "Sin especificar"'}
          checked={display.sinEsp}
          onToggle={() => onChange({ sinEsp: !display.sinEsp })}
        />
      ) : null}

      {tab === "funciones" ? (
        <p className="mx-0.5 mt-1 text-xs font-semibold text-[var(--n-500)]">
          Sin ajustes extra aquí.
        </p>
      ) : null}
    </div>
  );
}

function ExportMenu({
  scope,
  format,
  onScope,
  onFormat,
  onDownload,
}: {
  scope: "current" | "all";
  format: "csv" | "pdf";
  onScope: (scope: "current" | "all") => void;
  onFormat: (format: "csv" | "pdf") => void;
  onDownload: () => void;
}) {
  // CSV is one table by nature — "Todas las pestañas" applies to PDF only.
  const effectiveScope = format === "csv" ? "current" : scope;

  return (
    <div className={menuClass}>
      <h4 className={menuHeadingClass}>Alcance</h4>
      <SegmentedControl
        value={effectiveScope}
        options={[
          { value: "current", label: "Pestaña actual" },
          { value: "all", label: "Todas", disabled: format === "csv" },
        ]}
        onChange={onScope}
      />

      <h4 className={menuHeadingClass}>Formato</h4>
      <SegmentedControl
        value={format}
        options={[
          { value: "csv", label: "CSV" },
          { value: "pdf", label: "PDF" },
        ]}
        onChange={onFormat}
      />

      <button
        type="button"
        onClick={onDownload}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-[var(--accent)] bg-[var(--accent)] px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white transition hover:bg-[var(--accent-strong)]"
      >
        <Download className="size-3.5" />
        Descargar
      </button>
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
  const [detailPerson, setDetailPerson] = useState<{
    id: string;
    fullName: string;
  } | null>(null);
  const [personaSearch, setPersonaSearch] = useState("");
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_REPORT_FILTERS);
  const [display, setDisplay] = useState<DisplayOptions>(DEFAULT_DISPLAY);
  const [closedGroups, setClosedGroups] = useState<
    Record<FilterDimension, boolean>
  >({ ligas: false, teams: false, modes: false, roles: false });
  const [teamSearch, setTeamSearch] = useState("");
  const [openMenu, setOpenMenu] = useState<"gear" | "exp" | null>(null);
  const [exportScope, setExportScope] = useState<"current" | "all">("current");
  const [exportFormat, setExportFormat] = useState<"csv" | "pdf">("csv");
  const [retryCount, setRetryCount] = useState(0);
  const toolsRef = useRef<HTMLDivElement | null>(null);

  // The result is keyed by the request that produced it; a key mismatch with the
  // current range means a fetch is in flight (no sync setState in effects). One
  // fetch per range — all filtering below runs in the browser.
  const [result, setResult] = useState<{
    key: string;
    matches: ReportMatchRow[] | null;
    error: string | null;
  } | null>(null);

  const hasValidRange = Boolean(from && to && from <= to);
  const requestKey = `${from}|${to}|${timezone}|${retryCount}`;

  useEffect(() => {
    if (!hasValidRange) {
      return;
    }

    let cancelled = false;

    async function loadMatches() {
      try {
        const params = new URLSearchParams({ from, to, timezone });
        const response = await fetch(`/api/grid/reports?${params.toString()}`);
        const payload = (await response.json()) as {
          matches?: ReportMatchRow[];
          error?: string;
        };

        if (!response.ok || !payload.matches) {
          throw new Error(payload.error || "No se pudo cargar el resumen.");
        }

        if (!cancelled) {
          setResult({ key: requestKey, matches: payload.matches, error: null });
        }
      } catch (caught) {
        if (!cancelled) {
          setResult({
            key: requestKey,
            matches: null,
            error: ensureErrorMessage(caught),
          });
        }
      }
    }

    void loadMatches();

    return () => {
      cancelled = true;
    };
  }, [hasValidRange, requestKey, from, to, timezone]);

  const isLoading = hasValidRange && result?.key !== requestKey;
  const rawRows = result?.key === requestKey ? result.matches : null;
  const error = result?.key === requestKey ? result.error : null;

  const filtered = useMemo(
    () => (rawRows ? filterMatches(rawRows, filters) : []),
    [rawRows, filters],
  );

  const summary = useMemo(
    () => buildGridReportSummary(filtered),
    [filtered],
  );

  const facets = useMemo(
    () => (rawRows ? buildFacetCounts(rawRows, filters) : EMPTY_FACETS),
    [rawRows, filters],
  );

  const displaySummary = useMemo<GridReportSummary>(
    () => ({
      matchCount: summary.matchCount,
      personas: sortPersonas(summary.personas, display),
      equipos: transformEquipos(summary.equipos, display, filters),
      produccion: transformProduccion(summary.produccion, display),
      funciones: transformFunciones(summary.funciones, display),
    }),
    [summary, display, filters],
  );

  const detail = useMemo(
    () => (detailPerson ? buildPersonDetail(filtered, detailPerson.id) : null),
    [filtered, detailPerson],
  );

  const totalMatches = rawRows?.length ?? 0;
  const shownMatches = filtered.length;
  const isFiltered = totalMatches !== shownMatches;
  const activeFilterCount =
    filters.ligas.length +
    filters.teams.length +
    filters.modes.length +
    filters.roles.length;
  const anyFilter = activeFilterCount > 0;
  const canExport = shownMatches > 0;
  const rangeLabel = `${from} – ${to}`;
  const inDetail = Boolean(detailPerson) && activeTab === "personas";

  function toggleOption(dim: FilterDimension, value: string) {
    setFilters((current) => {
      const present = current[dim].includes(value);
      return {
        ...current,
        [dim]: present
          ? current[dim].filter((entry) => entry !== value)
          : [...current[dim], value],
      };
    });
  }

  function handleExport() {
    if (!canExport) {
      return;
    }

    if (exportFormat === "csv") {
      const table = buildStatsExportTable(displaySummary, activeTab);
      downloadStatsBlob(
        new Blob([buildStatsCsv(table)], { type: "text/csv;charset=utf-8" }),
        `${buildStatsFileBaseName({ tabLabel: table.tabLabel, from, to })}.csv`,
      );
    } else if (exportScope === "all") {
      const tables = ALL_STATS_TABS.map((tab) =>
        buildStatsExportTable(displaySummary, tab),
      );
      void exportAllStatsPdf({
        tables,
        rangeLabel,
        fileBaseName: buildAllStatsFileBaseName({ from, to }),
      });
    } else {
      const table = buildStatsExportTable(displaySummary, activeTab);
      void exportStatsPdf({
        table,
        rangeLabel,
        fileBaseName: buildStatsFileBaseName({
          tabLabel: table.tabLabel,
          from,
          to,
        }),
      });
    }

    setOpenMenu(null);
  }

  const iconButtonClass =
    "inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background-soft)] p-2.5 text-[var(--n-600)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50";

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

  useEffect(() => {
    if (!openMenu) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (
        toolsRef.current &&
        !toolsRef.current.contains(event.target as Node)
      ) {
        setOpenMenu(null);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [openMenu]);

  const rangeInputClass =
    "rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none transition focus:border-[var(--accent-border)]";

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-start justify-center bg-[rgba(28,13,16,0.48)] px-4 py-8 backdrop-blur-sm">
      <div className="absolute inset-0" aria-hidden="true" onClick={onClose} />
      <div className="relative z-[1] flex max-h-[calc(100vh-4rem)] w-full max-w-[920px] flex-col overflow-hidden rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lift)]">
        <div className="flex items-start justify-between gap-6 border-b border-[var(--border)] px-7 py-6">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--n-400)]">
              Producción
            </p>
            <h2 className="text-xl font-extrabold tracking-tight text-[var(--foreground)]">
              Estadísticas
            </h2>
            {rawRows && !isLoading ? (
              <p className="text-sm text-[var(--muted)]">
                <b className="font-extrabold tabular-nums text-[var(--foreground)]">
                  {shownMatches}
                </b>
                {isFiltered ? ` de ${totalMatches}` : ""} partidos
                {isFiltered ? " (filtrado)" : " en el rango"}
              </p>
            ) : null}
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
        </div>

        <div className="flex min-h-0 flex-1">
          <FilterSidebar
            facets={facets}
            filters={filters}
            closedGroups={closedGroups}
            teamSearch={teamSearch}
            activeCount={activeFilterCount}
            onToggleOption={toggleOption}
            onToggleGroup={(dim) =>
              setClosedGroups((current) => ({
                ...current,
                [dim]: !current[dim],
              }))
            }
            onTeamSearch={setTeamSearch}
            onClearAll={() => setFilters(EMPTY_REPORT_FILTERS)}
          />

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-5 py-3 sm:px-7">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.key);
                    setDetailPerson(null);
                  }}
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
              {inDetail ? null : (
                <div ref={toolsRef} className="relative ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenMenu((current) =>
                        current === "gear" ? null : "gear",
                      )
                    }
                    aria-label="Opciones de la tabla"
                    title="Opciones"
                    className={cn(
                      iconButtonClass,
                      openMenu === "gear" &&
                        "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)]",
                    )}
                  >
                    <SlidersHorizontal className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenMenu((current) =>
                        current === "exp" ? null : "exp",
                      )
                    }
                    disabled={!canExport}
                    aria-label="Exportar"
                    title="Exportar"
                    className={cn(
                      iconButtonClass,
                      openMenu === "exp" &&
                        "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)]",
                    )}
                  >
                    <Download className="size-4" />
                  </button>
                  {openMenu === "gear" ? (
                    <OpcionesMenu
                      tab={activeTab}
                      display={display}
                      onChange={(next) =>
                        setDisplay((current) => ({ ...current, ...next }))
                      }
                    />
                  ) : null}
                  {openMenu === "exp" ? (
                    <ExportMenu
                      scope={exportScope}
                      format={exportFormat}
                      onScope={setExportScope}
                      onFormat={(next) => {
                        setExportFormat(next);
                        if (next === "csv") {
                          setExportScope("current");
                        }
                      }}
                      onDownload={handleExport}
                    />
                  ) : null}
                </div>
              )}
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
              ) : !rawRows ? null : totalMatches === 0 ? (
                <EmptyRangeNotice message="No hay partidos en el rango seleccionado." />
              ) : shownMatches === 0 && !inDetail ? (
                <EmptyRangeNotice message="Ningún partido coincide con los filtros seleccionados. Ajustá o limpiá los filtros de la izquierda." />
              ) : activeTab === "personas" ? (
                inDetail ? (
                  <PersonDetailPanel
                    detail={detail}
                    fullName={detailPerson?.fullName ?? ""}
                    isFiltered={anyFilter}
                    timezone={timezone}
                    rangeLabel={rangeLabel}
                    from={from}
                    to={to}
                    onBack={() => setDetailPerson(null)}
                    iconButtonClass={iconButtonClass}
                  />
                ) : (
                  <PersonasTab
                    personas={displaySummary.personas}
                    metric={display.metric}
                    search={personaSearch}
                    onSearch={setPersonaSearch}
                    onSelectPerson={setDetailPerson}
                  />
                )
              ) : activeTab === "equipos" ? (
                <EquiposTab equipos={displaySummary.equipos} />
              ) : activeTab === "produccion" ? (
                <ProduccionTab produccion={displaySummary.produccion} />
              ) : (
                <FuncionesTab funciones={displaySummary.funciones} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
