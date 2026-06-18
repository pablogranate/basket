"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Columns3, GripVertical, PencilLine } from "lucide-react";

import { CreateMatchModal } from "@/components/grid/create-match-modal";
import {
  GridTableCellEditor,
  type GridCellEditor,
} from "@/components/grid/grid-table-cell-editor";
import {
  COMMENTARY_PLAN_OPTIONS,
  getProductionModeLabel,
  normalizeCommentaryPlan,
  PRODUCTION_MODE_OPTIONS,
} from "@/lib/constants";
import { formatMatchDate } from "@/lib/date";
import { roleNameToFunctionKey } from "@/lib/functions";
import { getGridLeagueColor } from "@/lib/league-grid-colors";
import {
  GRID_EXPORT_COLUMNS,
  toExportRows,
  type GridExportRow,
} from "@/lib/grid-table";
import { toMatchEditPrefill } from "@/lib/grid/match-prefill";
import type { GridOwner, MatchListItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export type GridTableRow = {
  dayLabel: string;
  match: MatchListItem;
};

type GridTableProps = {
  rows: GridTableRow[];
  canEdit: boolean;
  redirectTo: string;
  people: GridOwner[];
};

const HIDDEN_COLUMNS_STORAGE_KEY =
  "basket-production.grid.table-hidden-columns.v1";
const EDIT_MODE_STORAGE_KEY = "basket-production.grid.table-edit-mode.v1";
const COLUMN_WIDTHS_STORAGE_KEY =
  "basket-production.grid.table-column-widths.v1";
const COLUMN_ORDER_STORAGE_KEY =
  "basket-production.grid.table-column-order.v1";
const MIN_COLUMN_WIDTH = 64;

const TABLE_COLUMNS = GRID_EXPORT_COLUMNS.filter(
  (column) => column.key !== "Dia",
);

const TOGGLEABLE_COLUMNS: Array<{ key: string; label: string }> = [
  { key: "Dia", label: "Día" },
  ...TABLE_COLUMNS.map((column) => ({
    key: column.key as string,
    label: column.label,
  })),
];

const DEFAULT_COLUMN_ORDER = TOGGLEABLE_COLUMNS.map((column) => column.key);

const COLUMN_LABEL_BY_KEY = new Map(
  TOGGLEABLE_COLUMNS.map((column) => [column.key, column.label]),
);

const WIDE_TEXT_KEYS = new Set([
  "Relatos/Comentarios",
  "Transporte",
  "Observacion",
]);

const ASSIGNMENT_ROLE_BY_KEY: Partial<Record<keyof GridExportRow, string>> = {
  Responsable: "Responsable",
  Realizador: "Realizador",
  "Operador de Grafica": "Operador de Grafica",
  "Camara 1": "Camara 1",
  "Camara 2": "Camara 2",
  "Camara 3": "Camara 3",
  "Camara 4": "Camara 4",
  "Camara 5": "Camara 5",
  Relator: "Relator",
  "Comentarista 1": "Comentario 1",
  "Comentarista 2": "Comentario 2",
  "Operador de Control": "Operador de Control",
  "Soporte tecnico": "Soporte tecnico",
};

const headerCellClassName =
  "whitespace-nowrap px-5 py-4 text-[11px] font-black uppercase tracking-[0.18em] text-[#94a3b8]";

const editTriggerClassName =
  "inline-flex size-10 items-center justify-center rounded-full border border-[#d7dde7] bg-[#f4f6fa] text-[#16181d] shadow-none transition hover:border-[rgba(230,18,56,0.24)] hover:bg-[#fff3f6] hover:text-[var(--accent)]";

function normalizeHiddenColumns(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const validKeys = new Set(TOGGLEABLE_COLUMNS.map((column) => column.key));
  return value.filter(
    (item): item is string => typeof item === "string" && validKeys.has(item),
  );
}

function normalizeColumnOrder(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const validKeys = new Set(DEFAULT_COLUMN_ORDER);
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const item of value) {
    if (typeof item === "string" && validKeys.has(item) && !seen.has(item)) {
      seen.add(item);
      ordered.push(item);
    }
  }

  for (const key of DEFAULT_COLUMN_ORDER) {
    if (!seen.has(key)) {
      ordered.push(key);
    }
  }

  return ordered;
}

function readStoredList<T>(
  storageKey: string,
  normalize: (value: unknown) => T[] | null,
): T[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    return (
      normalize(JSON.parse(window.localStorage.getItem(storageKey) ?? "null")) ??
      []
    );
  } catch {
    window.localStorage.removeItem(storageKey);
    return [];
  }
}

function readStoredColumnWidths(): Record<string, number> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY) ?? "null",
    );

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const result: Record<string, number> = {};

    for (const [key, raw] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        typeof raw === "number" &&
        Number.isFinite(raw) &&
        raw >= MIN_COLUMN_WIDTH
      ) {
        result[key] = Math.round(raw);
      }
    }

    return result;
  } catch {
    window.localStorage.removeItem(COLUMN_WIDTHS_STORAGE_KEY);
    return {};
  }
}

function getCellEditor(
  columnKey: keyof GridExportRow,
  match: MatchListItem,
): GridCellEditor | null {
  const roleName = ASSIGNMENT_ROLE_BY_KEY[columnKey];

  if (roleName) {
    const assignment = match.assignments.find(
      (item) => item.role.name === roleName,
    );

    if (!assignment) {
      return null;
    }

    return {
      kind: "assignment",
      roleId: assignment.role_id,
      personId: assignment.person?.id ?? "",
      confirmed: assignment.confirmed,
      notes: assignment.notes ?? "",
      functionKey: roleNameToFunctionKey(roleName),
    };
  }

  switch (columnKey) {
    case "Produccion":
      return {
        kind: "match",
        field: "productionMode",
        value: getProductionModeLabel(match.production_mode),
        input: "select",
        options: [
          { value: "", label: "Sin definir" },
          ...PRODUCTION_MODE_OPTIONS.map((option) => ({
            value: option,
            label: option,
          })),
        ],
      };
    case "ID":
      return {
        kind: "match",
        field: "productionCode",
        value: match.production_code ?? "",
        input: "text",
      };
    case "Liga":
      return {
        kind: "match",
        field: "competition",
        value: match.competition ?? "",
        input: "text",
      };
    case "Hora":
      return {
        kind: "match",
        field: "kickoffTime",
        value: formatMatchDate(match.kickoff_at, match.timezone, "HH:mm"),
        input: "time",
      };
    case "Relatos/Comentarios":
      return {
        kind: "match",
        field: "commentaryPlan",
        value: normalizeCommentaryPlan(match.commentary_plan),
        input: "select",
        options: [
          { value: "", label: "Sin definir" },
          ...COMMENTARY_PLAN_OPTIONS.map((option) => ({
            value: option,
            label: option,
          })),
        ],
      };
    case "Transporte":
      return {
        kind: "match",
        field: "transport",
        value: match.transport ?? "",
        input: "text",
      };
    case "Observacion":
      return {
        kind: "match",
        field: "notes",
        value: match.notes ?? "",
        input: "text",
      };
    default:
      return null;
  }
}

function PickerCheckRow({
  label,
  visible,
  onToggle,
}: {
  label: string;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-[var(--foreground)] transition hover:bg-[#f4f6fa]"
    >
      <span
        className={cn(
          "inline-flex size-4.5 shrink-0 items-center justify-center rounded-md border transition",
          visible
            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
            : "border-[#cbd5e1] bg-white text-transparent",
        )}
      >
        <Check className="size-3" />
      </span>
      {label}
    </button>
  );
}

function GridColumnsPicker({
  hiddenColumns,
  onToggleColumn,
}: {
  hiddenColumns: string[];
  onToggleColumn: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--muted)] transition hover:border-[rgba(230,18,56,0.24)] hover:text-[var(--accent)]",
          open && "border-[rgba(230,18,56,0.24)] text-[var(--accent)]",
        )}
      >
        <Columns3 className="size-4" />
        Columnas
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 max-h-96 w-60 overflow-y-auto rounded-[18px] border border-[var(--border)] bg-white p-2 shadow-[0_20px_48px_rgba(28,13,16,0.16)]">
          {TOGGLEABLE_COLUMNS.map((column) => (
            <PickerCheckRow
              key={column.key}
              label={column.label}
              visible={!hiddenColumns.includes(column.key)}
              onToggle={() => onToggleColumn(column.key)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function GridTable({ rows, canEdit, redirectTo, people }: GridTableProps) {
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() =>
    readStoredList(HIDDEN_COLUMNS_STORAGE_KEY, normalizeHiddenColumns),
  );
  const [editMode, setEditMode] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(EDIT_MODE_STORAGE_KEY) === "true";
  });
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    () => readStoredColumnWidths(),
  );
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    const stored = readStoredList(COLUMN_ORDER_STORAGE_KEY, normalizeColumnOrder);
    return stored.length ? stored : DEFAULT_COLUMN_ORDER;
  });
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const columnOrderRef = useRef(columnOrder);
  const columnWidthsRef = useRef(columnWidths);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    scrollLeft: number;
    dragging: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    columnWidthsRef.current = columnWidths;
  }, [columnWidths]);

  useEffect(() => {
    columnOrderRef.current = columnOrder;
  }, [columnOrder]);

  function toggleColumn(key: string) {
    setHiddenColumns((current) => {
      const next = current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key];

      window.localStorage.setItem(
        HIDDEN_COLUMNS_STORAGE_KEY,
        JSON.stringify(next),
      );
      return next;
    });
  }

  function toggleEditMode() {
    setEditMode((current) => {
      const next = !current;
      window.localStorage.setItem(EDIT_MODE_STORAGE_KEY, String(next));
      return next;
    });
  }

  function persistColumnWidths(widths: Record<string, number>) {
    window.localStorage.setItem(
      COLUMN_WIDTHS_STORAGE_KEY,
      JSON.stringify(widths),
    );
  }

  function handleResizeStart(
    event: React.PointerEvent<HTMLElement>,
    columnKey: string,
  ) {
    event.preventDefault();
    event.stopPropagation();

    const headerCell = event.currentTarget.closest("th");
    const startWidth =
      columnWidthsRef.current[columnKey] ?? headerCell?.offsetWidth ?? 120;
    const startX = event.clientX;
    let latestWidth = startWidth;

    function handleMove(moveEvent: PointerEvent) {
      const nextWidth = Math.max(
        MIN_COLUMN_WIDTH,
        Math.round(startWidth + moveEvent.clientX - startX),
      );

      latestWidth = nextWidth;
      setColumnWidths((current) => ({ ...current, [columnKey]: nextWidth }));
    }

    function handleUp() {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
      persistColumnWidths({
        ...columnWidthsRef.current,
        [columnKey]: latestWidth,
      });
    }

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
  }

  function handleColumnDragStart(columnKey: string) {
    setDraggedColumn(columnKey);
  }

  function handleColumnDragOver(
    event: React.DragEvent<HTMLElement>,
    columnKey: string,
  ) {
    event.preventDefault();

    if (!draggedColumn || draggedColumn === columnKey) {
      return;
    }

    setColumnOrder((current) => {
      const from = current.indexOf(draggedColumn);
      const to = current.indexOf(columnKey);

      if (from === -1 || to === -1 || from === to) {
        return current;
      }

      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, draggedColumn);
      return next;
    });
  }

  function handleColumnDragEnd() {
    setDraggedColumn(null);
    window.localStorage.setItem(
      COLUMN_ORDER_STORAGE_KEY,
      JSON.stringify(columnOrderRef.current),
    );
  }

  function resetColumnWidth(columnKey: string) {
    setColumnWidths((current) => {
      const next = { ...current };
      delete next[columnKey];
      persistColumnWidths(next);
      return next;
    });
  }

  function getWidthStyle(columnKey: string): React.CSSProperties | undefined {
    const width = columnWidths[columnKey];

    if (!width) {
      return undefined;
    }

    return { width, minWidth: width, maxWidth: width };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("input, select, textarea, [draggable='true']")) {
      return;
    }

    const element = scrollRef.current;
    if (!element) {
      return;
    }

    suppressClickRef.current = false;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: element.scrollLeft,
      dragging: false,
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const state = dragStateRef.current;
    const element = scrollRef.current;

    if (!state || !element) {
      return;
    }

    const deltaX = event.clientX - state.startX;

    if (!state.dragging) {
      if (Math.abs(deltaX) < 5) {
        return;
      }

      state.dragging = true;
      suppressClickRef.current = true;
      element.setPointerCapture(state.pointerId);
    }

    event.preventDefault();
    element.scrollLeft = state.scrollLeft - deltaX;
  }

  function handlePointerEnd() {
    const state = dragStateRef.current;
    const element = scrollRef.current;

    if (state?.dragging && element?.hasPointerCapture(state.pointerId)) {
      element.releasePointerCapture(state.pointerId);
    }

    dragStateRef.current = null;
  }

  function handleClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = false;
    }
  }

  function renderHeaderCell(key: string) {
    const label = COLUMN_LABEL_BY_KEY.get(key) ?? key;

    return (
      <th
        key={key}
        style={getWidthStyle(key)}
        onDragOver={(event) => handleColumnDragOver(event, key)}
        className={cn(
          headerCellClassName,
          "sticky top-0 z-20 bg-[#fafbfd]",
          "relative overflow-hidden",
          draggedColumn === key && "bg-[#eef2f7]",
        )}
      >
        <span className="inline-flex max-w-full items-center gap-1.5">
          <button
            type="button"
            draggable
            aria-label={`Reordenar columna ${label}`}
            onDragStart={() => handleColumnDragStart(key)}
            onDragEnd={handleColumnDragEnd}
            className={cn(
              "inline-flex size-5 shrink-0 cursor-grab items-center justify-center rounded-md text-[#c3cdda] transition hover:bg-[#eef2f7] hover:text-[#617187]",
              draggedColumn === key && "bg-white text-[#617187] shadow-sm",
            )}
          >
            <GripVertical className="size-3" />
          </button>
          <span className="truncate">{label}</span>
        </span>
        <span
          aria-hidden
          onPointerDown={(event) => handleResizeStart(event, key)}
          onDoubleClick={() => resetColumnWidth(key)}
          className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none select-none transition hover:bg-[rgba(230,18,56,0.32)]"
        />
      </th>
    );
  }

  const visibleColumnKeys = columnOrder.filter(
    (key) => !hiddenColumns.includes(key),
  );

  const editingEnabled = canEdit && editMode;

  return (
    <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center justify-end gap-3 border-b border-[var(--border)] px-5 py-3">
        {canEdit ? (
          <button
            type="button"
            onClick={toggleEditMode}
            aria-pressed={editMode}
            className={cn(
              "inline-flex h-10 items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold transition hover:border-[rgba(230,18,56,0.24)]",
              editMode ? "text-[var(--accent)]" : "text-[var(--muted)]",
            )}
          >
            <span
              className={cn(
                "inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition",
                editMode ? "bg-[var(--accent)]" : "bg-[#cbd5e1]",
              )}
            >
              <span
                className={cn(
                  "block size-4 rounded-full bg-white shadow-sm transition",
                  editMode && "translate-x-4",
                )}
              />
            </span>
            Habilitar edición
          </button>
        ) : null}
        <GridColumnsPicker
          hiddenColumns={hiddenColumns}
          onToggleColumn={toggleColumn}
        />
      </div>
      <div
        ref={scrollRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onClickCapture={handleClickCapture}
        className="max-h-[calc(100vh-220px)] overflow-x-auto overflow-y-auto rounded-b-[var(--panel-radius)]"
      >
        <table className="min-w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr className="divide-x divide-[#edf1f6] bg-[#fafbfd]">
              {visibleColumnKeys.map((key) => renderHeaderCell(key))}
              {canEdit ? (
                <th
                  className={cn(
                    headerCellClassName,
                    "sticky top-0 z-20 bg-[#fafbfd]",
                  )}
                >
                  Acciones
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf1f6]">
            {rows.map(({ dayLabel, match }) => {
              const exportRow = toExportRows([match])[0];

              return (
                <tr
                  key={match.id}
                  className="group divide-x divide-[#edf1f6] transition hover:bg-[#fafbfd]"
                >
                  {visibleColumnKeys.map((key) => {
                    if (key === "Dia") {
                      return (
                        <td
                          key={key}
                          style={getWidthStyle("Dia")}
                          className={cn(
                            "whitespace-nowrap px-5 py-3 text-sm font-semibold text-[var(--foreground)]",
                            columnWidths.Dia && "overflow-hidden text-ellipsis",
                          )}
                        >
                          {dayLabel}
                        </td>
                      );
                    }

                    const columnKey = key as keyof GridExportRow;
                    const rawValue = exportRow[columnKey];
                    // Assignment columns: render the unassigned placeholder as a
                    // dash in the table; the picker still labels it "Sin asignar".
                    const value =
                      ASSIGNMENT_ROLE_BY_KEY[columnKey] &&
                      rawValue === "Sin asignar"
                        ? "-"
                        : rawValue;
                    const isWide = WIDE_TEXT_KEYS.has(columnKey);
                    const editor = editingEnabled
                      ? getCellEditor(columnKey, match)
                      : null;

                    if (columnKey === "Partido" && editingEnabled) {
                      return (
                        <td
                          key={columnKey}
                          style={getWidthStyle(columnKey)}
                          className={cn(
                            "whitespace-nowrap px-5 py-3 text-sm text-[var(--foreground)]",
                            columnWidths[columnKey] &&
                              "overflow-hidden text-ellipsis",
                          )}
                        >
                          <div className="flex items-center gap-1">
                            <GridTableCellEditor
                              key={`home-${match.home_team}`}
                              matchId={match.id}
                              redirectTo={redirectTo}
                              display={match.home_team}
                              people={people}
                              editor={{
                                kind: "match",
                                field: "homeTeam",
                                value: match.home_team,
                                input: "text",
                              }}
                            />
                            <span className="text-xs font-semibold uppercase text-[#93a0b2]">
                              vs
                            </span>
                            <GridTableCellEditor
                              key={`away-${match.away_team}`}
                              matchId={match.id}
                              redirectTo={redirectTo}
                              display={match.away_team}
                              people={people}
                              editor={{
                                kind: "match",
                                field: "awayTeam",
                                value: match.away_team,
                                input: "text",
                              }}
                            />
                          </div>
                        </td>
                      );
                    }

                    const leagueColor =
                      columnKey === "Liga"
                        ? getGridLeagueColor(value)
                        : null;

                    return (
                      <td
                        key={columnKey}
                        title={isWide ? value || undefined : undefined}
                        style={{
                          ...getWidthStyle(columnKey),
                          ...(leagueColor && {
                            backgroundColor: leagueColor.background,
                            color: leagueColor.text,
                          }),
                        }}
                        className={cn(
                          "px-5 py-3 text-sm",
                          isWide
                            ? "max-w-[22rem] truncate text-[var(--muted)]"
                            : "whitespace-nowrap text-[var(--foreground)]",
                          columnWidths[columnKey] &&
                            "overflow-hidden text-ellipsis",
                        )}
                      >
                        {editor ? (
                          <GridTableCellEditor
                            key={value}
                            matchId={match.id}
                            redirectTo={redirectTo}
                            display={value}
                            people={people}
                            editor={editor}
                          />
                        ) : (
                          value || "—"
                        )}
                      </td>
                    );
                  })}
                  {canEdit ? (
                    <td className="whitespace-nowrap px-5 py-3">
                      <CreateMatchModal
                        people={people}
                        redirectTo={redirectTo}
                        canEdit={canEdit}
                        initialDate={formatMatchDate(
                          match.kickoff_at,
                          match.timezone,
                          "yyyy-MM-dd",
                        )}
                        match={toMatchEditPrefill(match)}
                        triggerVariant="icon"
                        triggerLabel="Editar partido"
                        triggerIcon={<PencilLine className="size-4" />}
                        triggerClassName={editTriggerClassName}
                      />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
