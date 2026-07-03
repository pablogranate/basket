"use client";

import { useEffect, useState } from "react";
import { GripVertical, Mail, MapPin, MessageCircle } from "lucide-react";
import Link from "next/link";

import {
  getCityIndicator,
  getInitials,
  getPersonRoleDisplay,
  getWhatsAppHref,
} from "@/components/people/people-view-helpers";
import { PersonActiveToggle } from "@/components/people/person-active-toggle";
import { parsePersonNotesMeta } from "@/lib/people-notes";
import type { PersonListItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type PeopleTableColumn =
  | "profile"
  | "role"
  | "details"
  | "phone"
  | "email"
  | "city"
  | "status";

const PEOPLE_TABLE_COLUMNS_STORAGE_KEY =
  "basket-production.people.table-columns.v2";
const DEFAULT_PEOPLE_TABLE_COLUMNS: PeopleTableColumn[] = [
  "profile",
  "role",
  "details",
  "phone",
  "email",
  "city",
  "status",
];

function normalizePeopleTableColumns(
  value: unknown,
): PeopleTableColumn[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const nextColumns = value.filter((item): item is PeopleTableColumn =>
    DEFAULT_PEOPLE_TABLE_COLUMNS.includes(item as PeopleTableColumn),
  );

  if (
    nextColumns.length !== DEFAULT_PEOPLE_TABLE_COLUMNS.length ||
    new Set(nextColumns).size !== DEFAULT_PEOPLE_TABLE_COLUMNS.length
  ) {
    return null;
  }

  return nextColumns;
}

export function PeopleTable({
  people,
  canEdit,
}: {
  people: PersonListItem[];
  canEdit: boolean;
}) {
  const [columnOrder, setColumnOrder] = useState<PeopleTableColumn[]>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_PEOPLE_TABLE_COLUMNS;
    }

    try {
      const parsedColumns = normalizePeopleTableColumns(
        JSON.parse(
          window.localStorage.getItem(PEOPLE_TABLE_COLUMNS_STORAGE_KEY) ??
            "null",
        ),
      );

      return parsedColumns ?? DEFAULT_PEOPLE_TABLE_COLUMNS;
    } catch {
      window.localStorage.removeItem(PEOPLE_TABLE_COLUMNS_STORAGE_KEY);
      return DEFAULT_PEOPLE_TABLE_COLUMNS;
    }
  });
  const [draggedColumn, setDraggedColumn] =
    useState<PeopleTableColumn | null>(null);
  const [dragOverColumn, setDragOverColumn] =
    useState<PeopleTableColumn | null>(null);

  useEffect(() => {
    window.localStorage.setItem(
      PEOPLE_TABLE_COLUMNS_STORAGE_KEY,
      JSON.stringify(columnOrder),
    );
  }, [columnOrder]);

  function handleColumnDragStart(column: PeopleTableColumn) {
    setDraggedColumn(column);
    setDragOverColumn(column);
  }

  function handleColumnDragOver(column: PeopleTableColumn) {
    if (draggedColumn && draggedColumn !== column) {
      setDragOverColumn(column);
    }
  }

  function handleColumnDrop(column: PeopleTableColumn) {
    if (!draggedColumn || draggedColumn === column) {
      setDraggedColumn(null);
      setDragOverColumn(null);
      return;
    }

    setColumnOrder((current) => {
      const next = [...current];
      const draggedIndex = next.indexOf(draggedColumn);
      const targetIndex = next.indexOf(column);

      if (draggedIndex === -1 || targetIndex === -1) {
        return current;
      }

      next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, draggedColumn);
      return next;
    });

    setDraggedColumn(null);
    setDragOverColumn(null);
  }

  function handleColumnDragEnd() {
    setDraggedColumn(null);
    setDragOverColumn(null);
  }

  const renderHeader = (column: PeopleTableColumn) => {
    const isDropTarget =
      !!draggedColumn && draggedColumn !== column && dragOverColumn === column;

    const label =
      column === "profile"
        ? "Nombre"
        : column === "role"
          ? "Rol"
          : column === "details"
            ? "Responsable"
          : column === "phone"
            ? "Celular"
          : column === "email"
            ? "Correo"
          : column === "city"
            ? "Ciudad"
          : column === "status"
            ? "Estado"
            : "";

    return (
      <th
        key={column}
        className={cn(
          "px-6 py-4 transition-colors",
          column === "profile" && "px-8",
          isDropTarget && "bg-[var(--n-50)]",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          handleColumnDragOver(column);
        }}
        onDrop={(event) => {
          event.preventDefault();
          handleColumnDrop(column);
        }}
      >
        <div
          className={cn(
            "flex items-center justify-between gap-2",
          )}
        >
          <span>{label}</span>
          <button
            type="button"
            draggable
            aria-label={`Reordenar columna ${label}`}
            onDragStart={() => handleColumnDragStart(column)}
            onDragEnd={handleColumnDragEnd}
            className={cn(
              "inline-flex size-6 items-center justify-center rounded-md text-[var(--n-300)] transition hover:bg-[var(--n-100)] hover:text-[var(--n-600)]",
              draggedColumn === column && "bg-white text-[var(--n-600)] shadow-sm",
            )}
          >
            <GripVertical className="size-3.5" />
          </button>
        </div>
      </th>
    );
  };

  const renderCell = (person: PersonListItem, column: PeopleTableColumn) => {
    const meta = parsePersonNotesMeta(person.notes);
    const { roleLabel, rolePresentation } = getPersonRoleDisplay(person);
    const city = meta.city || "";
    const cityIndicator = getCityIndicator(city);
    const detailSummary = meta.coverage || "";
    const cellClassName = cn(
      "px-6 py-5",
      column === "profile" && "px-8",
    );

    switch (column) {
      case "profile":
        return (
          <td key={column} className={cellClassName}>
            <div className="flex items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--n-100)] text-sm font-extrabold text-[var(--n-600)]">
                {getInitials(person.full_name)}
              </div>
              <div className="min-w-0">
                {canEdit ? (
                  <Link
                    href={`/people?edit=${person.id}`}
                    className="truncate text-sm font-extrabold text-[var(--foreground)] transition hover:text-[var(--accent)]"
                  >
                    {person.full_name}
                  </Link>
                ) : (
                  <p className="truncate text-sm font-extrabold text-[var(--foreground)]">
                    {person.full_name}
                  </p>
                )}
              </div>
            </div>
          </td>
        );
      case "phone":
        return (
          <td key={column} className={cellClassName}>
            <div className="flex justify-start">
              <div className="flex items-center gap-2">
                {person.phone ? (
                  <a
                    href={getWhatsAppHref(person.phone) ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Escribir por WhatsApp a ${person.full_name}`}
                    className="inline-flex size-8 items-center justify-center rounded-full bg-[#ecfdf3] text-[#16a34a] transition hover:bg-[#dcfce7]"
                  >
                    <MessageCircle className="size-4" />
                  </a>
                ) : null}
                <p className="text-sm font-medium text-[var(--foreground)]">
                  {person.phone ?? "Sin teléfono"}
                </p>
              </div>
            </div>
          </td>
        );
      case "role":
        return (
          <td key={column} className={cellClassName}>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-full",
                  rolePresentation.className,
                )}
              >
                <rolePresentation.Icon className="size-4" />
              </span>
              <p className="text-sm font-medium text-[var(--foreground)]">
                {roleLabel}
              </p>
            </div>
          </td>
        );
      case "city":
        return (
          <td key={column} className={cellClassName}>
            <div className="flex justify-start">
              <div className="flex items-center gap-2">
                <span
                  title={cityIndicator.label}
                  className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--n-100)] text-sm"
                >
                  {cityIndicator.emoji ? (
                    <span aria-hidden="true">{cityIndicator.emoji}</span>
                  ) : (
                    <MapPin className="size-4 text-[var(--n-400)]" />
                  )}
                </span>
                <p className="text-sm font-medium text-[var(--foreground)]">
                  {city || "Sin ciudad"}
                </p>
              </div>
            </div>
          </td>
        );
      case "email":
        return (
          <td key={column} className={cellClassName}>
            <div className="flex justify-start">
              <div className="flex items-center gap-2">
                {person.email ? (
                  <a
                    href={`mailto:${person.email}`}
                    aria-label={`Escribir por correo a ${person.full_name}`}
                    className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] transition hover:bg-[var(--accent-border)]"
                  >
                    <Mail className="size-4" />
                  </a>
                ) : null}
                <p className="text-xs font-medium text-[var(--n-500)]">
                  {person.email ?? "Sin correo"}
                </p>
              </div>
            </div>
          </td>
        );
      case "status":
        return (
          <td key={column} className={cellClassName}>
            <div className="flex justify-start">
              <div className="flex items-center">
                <PersonActiveToggle
                  variant="switch"
                  personId={person.id}
                  active={person.active}
                  fullName={person.full_name}
                  canEdit={canEdit}
                />
              </div>
            </div>
          </td>
        );
      case "details":
        return (
          <td key={column} className={cellClassName}>
            <p className="max-w-[22rem] truncate text-sm font-medium text-[var(--n-600)]">
              {detailSummary || "Sin responsable asignado"}
            </p>
          </td>
        );
      default:
        return null;
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-left">
        <thead>
          <tr className="bg-[var(--n-50)] text-[11px] font-black uppercase tracking-[0.18em] text-[var(--n-400)]">
            {columnOrder.map((column) => renderHeader(column))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--n-100)]">
          {people.map((person) => (
            <tr key={person.id} className="group transition hover:bg-[var(--n-50)]">
              {columnOrder.map((column) => renderCell(person, column))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
