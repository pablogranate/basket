"use client";

import { useMemo } from "react";
import { Download } from "lucide-react";

import { LazySectionAiAssistant } from "@/components/ai/section-ai-assistant-lazy";
import {
  usePeopleView,
  type PersonView,
} from "@/components/people/people-view-context";
import { getToolbarIconButtonClassName } from "@/components/ui/toolbar-icon-button";
import type { PeopleFilters } from "@/lib/people-filters";

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

function buildPeopleContextParams(filters: PeopleFilters, query: string) {
  const params: Record<string, string> = {};

  if (query) params.q = query;
  if (filters.role) params.role = filters.role;
  if (filters.state) params.state = filters.state;
  if (filters.city) params.city = filters.city;
  if (filters.team) params.team = filters.team;

  return params;
}

// Export + AI assistant follow the same client-side slice as the table, so they
// stay in step with the filters without re-rendering on the server.
export function PeopleHeaderExtras({
  hasGeminiKey,
}: {
  hasGeminiKey: boolean;
}) {
  const { rows, filters, query } = usePeopleView();
  const contextParams = useMemo(
    () => buildPeopleContextParams(filters, query),
    [filters, query],
  );

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
      <LazySectionAiAssistant
        section="Personal"
        title="Consulta el personal visible"
        description="Haz preguntas sobre roles, coberturas, disponibilidad, teléfonos o correos del personal cargado en esta pantalla."
        placeholder="Ej. ¿Qué rol tiene Santiago Córdoba y quién cubre Boca Juniors?"
        contextLabel="Personal visible en la vista actual"
        contextCount={rows.length}
        contextRef={{
          section: "people",
          params: contextParams,
        }}
        guidance="Prioriza rol principal, responsable de equipos, estado, teléfono, email y notas. Si preguntan por una persona, responde solo con lo visible en esta pantalla."
        examples={[
          "¿Qué rol tiene Santiago Córdoba?",
          "¿Quién cubre Boca Juniors?",
          "¿Qué datos hay de Juan Camilo y Samuel Venegas?",
        ]}
        hasGeminiKey={hasGeminiKey}
        buttonVariant="icon"
      />
    </>
  );
}
