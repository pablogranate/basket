import { RESPONSIBLE_DISPLAY_LABEL } from "@/lib/constants";
import { getAttendanceState, type AttendanceState } from "@/lib/grid/attendance";
import type { PersonRow, RoleRow } from "@/lib/database.types";

export type SectionRow = {
  label: string;
  value: string;
  muted?: boolean;
  compactValue?: boolean;
  multiline?: boolean;
  attendanceState?: AttendanceState;
};

export type MatchCardSectionKey =
  | "production"
  | "cameras"
  | "talent"
  | "observations";

export type MatchCardSection = {
  key: MatchCardSectionKey;
  rows: SectionRow[];
};

// Structural subset needed to read a single role slot by name. MatchListItem
// (grid render, role slimmed to its name) satisfies it, so MatchCard can call
// getAssignmentValue without carrying the role category/sort_order the grouped
// sections need.
type LookupAssignment = {
  person_id: string | null;
  attendance_response: string | null;
  role: Pick<RoleRow, "name">;
  person: Pick<PersonRow, "full_name"> | null;
};

export type LookupMatchInput = {
  assignments: LookupAssignment[];
  owner: Pick<PersonRow, "full_name"> | null;
};

// Structural subset sufficient to build the expandable detail sections. Only the
// on-demand getMatchCardSectionsAction row feeds this one: grouping by category
// and ordering by sort_order needs the wider role.
type SectionAssignment = LookupAssignment & {
  role: Pick<RoleRow, "name" | "category" | "sort_order">;
};

export type SectionMatchInput = {
  assignments: SectionAssignment[];
  owner: Pick<PersonRow, "full_name"> | null;
  transport: string | null;
  notes: string | null;
};

export function getAssignmentValue(
  match: LookupMatchInput,
  roleName: string,
  fallback?: string | null,
) {
  const assignment = match.assignments.find(
    (item) => item.role.name === roleName,
  );
  const value = assignment?.person?.full_name ?? fallback ?? "TBD";

  return {
    value,
    muted: !assignment?.person?.full_name && !fallback,
    attendanceState: getAttendanceState(
      assignment?.attendance_response ?? null,
      assignment?.person_id ?? null,
    ),
  };
}

function buildProductionRows(match: SectionMatchInput): SectionRow[] {
  const responsible = getAssignmentValue(
    match,
    "Responsable",
    match.owner?.full_name ?? null,
  );
  const director = getAssignmentValue(match, "Realizador");
  const control = getAssignmentValue(match, "Operador de Control");
  const support = getAssignmentValue(match, "Soporte tecnico");

  return [
    {
      label: RESPONSIBLE_DISPLAY_LABEL,
      value: responsible.value,
      muted: responsible.muted,
      compactValue: true,
      attendanceState: responsible.attendanceState,
    },
    {
      label: "Realizador",
      value: director.value,
      muted: director.muted,
      compactValue: true,
      attendanceState: director.attendanceState,
    },
    {
      label: "Operador de Control",
      value: control.value,
      muted: control.muted,
      compactValue: true,
      attendanceState: control.attendanceState,
    },
    {
      label: "Soporte tecnico",
      value: support.value,
      muted: support.muted,
      compactValue: true,
      attendanceState: support.attendanceState,
    },
  ];
}

function buildCategoryRows(
  match: SectionMatchInput,
  category: string,
  limit = 4,
): SectionRow[] {
  return match.assignments
    .filter((assignment) => assignment.role.category === category)
    .sort((left, right) => left.role.sort_order - right.role.sort_order)
    .slice(0, limit)
    .map((assignment) => ({
      label: assignment.role.name,
      value: assignment.person?.full_name ?? "TBD",
      muted: !assignment.person?.full_name,
      compactValue: true,
      attendanceState: getAttendanceState(
        assignment.attendance_response,
        assignment.person_id,
      ),
    }));
}

function buildNamedRows(
  match: SectionMatchInput,
  roleNames: string[],
): SectionRow[] {
  return roleNames.map((roleName) => {
    const item = getAssignmentValue(match, roleName);

    return {
      label: roleName,
      value: item.value,
      muted: item.muted,
      compactValue: true,
      attendanceState: item.attendanceState,
    };
  });
}

function buildObservationRows(match: SectionMatchInput): SectionRow[] {
  const transport = match.transport?.trim() ?? "";
  const notes = match.notes?.trim() ?? "";

  return [
    {
      label: "Transporte",
      value: transport || "Sin datos",
      muted: !transport,
      multiline: true,
    },
    {
      label: "Observaciones",
      value: notes || "Sin observaciones",
      muted: !notes,
      multiline: true,
    },
  ];
}

export function buildMatchCardSections(
  match: SectionMatchInput,
): MatchCardSection[] {
  return [
    { key: "production", rows: buildProductionRows(match) },
    { key: "cameras", rows: buildCategoryRows(match, "Camaras") },
    {
      key: "talent",
      rows: buildNamedRows(match, [
        "Relator",
        "Comentario 1",
        "Comentario 2",
        "Campo",
      ]),
    },
    { key: "observations", rows: buildObservationRows(match) },
  ];
}
