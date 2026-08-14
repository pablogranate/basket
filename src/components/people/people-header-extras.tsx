"use client";

import { Download } from "lucide-react";

import {
  usePeopleView,
  type PersonView,
} from "@/components/people/people-view-context";
import { getToolbarIconButtonClassName } from "@/components/ui/toolbar-icon-button";

function buildCsv(rows: PersonView[]) {
  const table = [
    [
      "Nombre",
      "Rol principal",
      "Ciudad",
      "Club",
      "Teléfono",
      "Email",
      "Estado",
      "Notas",
    ],
    ...rows.map((row) => [
      row.person.full_name,
      row.role,
      row.city,
      row.detailSummary,
      row.person.phone ?? "",
      row.person.email ?? "",
      row.person.assignment_state,
      row.notes,
    ]),
  ];

  return table
    .map((line) =>
      line
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\n");
}

// Export follows the same client-side slice as the table, so it stays in step
// with the filters without re-rendering on the server.
export function PeopleHeaderExtras() {
  const { rows } = usePeopleView();
  // Serializing the CSV is only worth it if someone actually downloads it:
  // building it eagerly re-encoded the whole list on every filter change.
  function handleDownload() {
    const blob = new Blob([buildCsv(rows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "basket-production-personal.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!rows.length) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={handleDownload}
        aria-label="Descargar lista de personal"
        title="Descargar lista de personal"
        className={getToolbarIconButtonClassName({ tone: "violet" })}
      >
        <Download className="size-4" />
      </button>
    </>
  );
}
