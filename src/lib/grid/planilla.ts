import type { StaffRoleName } from "@/lib/actions/parse/matches";
import {
  COMMENTARY_PLAN_OPTIONS,
  normalizeCommentaryPlan,
  normalizeProductionMode,
  PRODUCTION_MODE_OPTIONS,
} from "@/lib/constants";
import { formatMatchDate } from "@/lib/date";
import { getAttendanceState, type AttendanceState } from "@/lib/grid/attendance";
import { type PersonFunctionKey, roleNameToFunctionKey } from "@/lib/functions";
import type { MatchListItem } from "@/lib/types";
import { normalizeText } from "@/lib/utils";

// The Planilla is the grid as a spreadsheet: one row per Partido, one column
// per field or staff role. Column 0 holds the match id (hidden), so rows keep
// their Partido when the user sorts or inserts rows. Columns up to Visitante
// are frozen.

export type PlanillaMatchField =
  | "kickoffDate"
  | "kickoffTime"
  | "homeTeam"
  | "awayTeam"
  | "competition"
  | "productionMode"
  | "productionCode"
  | "commentaryPlan"
  | "transport"
  | "notes";

type ColumnBase = { key: string; label: string; width: number };

export type PlanillaColumn =
  | (ColumnBase & { kind: "id" })
  | (ColumnBase & {
      kind: "field";
      field: PlanillaMatchField;
      input: "date" | "time" | "text" | "league" | "team" | "list";
      options?: readonly string[];
    })
  | (ColumnBase & { kind: "role"; roleName: StaffRoleName });

function roleColumn(roleName: StaffRoleName, label: string): PlanillaColumn {
  return { key: `role:${roleName}`, label, width: 150, kind: "role", roleName };
}

export const PLANILLA_COLUMNS: readonly PlanillaColumn[] = [
  { key: "matchId", label: "id", width: 40, kind: "id" },
  { key: "fecha", label: "Fecha", width: 96, kind: "field", field: "kickoffDate", input: "date" },
  { key: "hora", label: "Hora", width: 64, kind: "field", field: "kickoffTime", input: "time" },
  { key: "liga", label: "Liga", width: 160, kind: "field", field: "competition", input: "league" },
  { key: "local", label: "Local", width: 170, kind: "field", field: "homeTeam", input: "team" },
  { key: "visitante", label: "Visitante", width: 170, kind: "field", field: "awayTeam", input: "team" },
  {
    key: "modo",
    label: "Producción",
    width: 130,
    kind: "field",
    field: "productionMode",
    input: "list",
    options: PRODUCTION_MODE_OPTIONS,
  },
  { key: "codigo", label: "ID", width: 80, kind: "field", field: "productionCode", input: "text" },
  roleColumn("Responsable", "Responsable"),
  roleColumn("Realizador", "Realizador"),
  roleColumn("Operador de Grafica", "Operador de Gráfica"),
  roleColumn("Camara 1", "Cámara 1"),
  roleColumn("Camara 2", "Cámara 2"),
  roleColumn("Camara 3", "Cámara 3"),
  roleColumn("Camara 4", "Cámara 4"),
  roleColumn("Camara 5", "Cámara 5"),
  {
    key: "relatos",
    label: "Relatos/Comentarios",
    width: 150,
    kind: "field",
    field: "commentaryPlan",
    input: "list",
    options: COMMENTARY_PLAN_OPTIONS,
  },
  roleColumn("Relator", "Relator"),
  roleColumn("Comentario 1", "Comentarista 1"),
  roleColumn("Comentario 2", "Comentarista 2"),
  roleColumn("Operador de Control", "Operador de Control"),
  roleColumn("Soporte tecnico", "Soporte técnico"),
  { key: "transporte", label: "Transporte", width: 160, kind: "field", field: "transport", input: "text" },
  { key: "observacion", label: "Observación", width: 260, kind: "field", field: "notes", input: "text" },
];

export const PLANILLA_FROZEN_COLUMNS = 6;

// Each user may drag columns into their own order. Only the view changes: the
// sheet maps its columns back to PLANILLA_COLUMNS before anything is read or
// saved. A stored order that no longer matches the columns is ignored.
export function resolveColumnOrder(stored: unknown): string[] {
  const keys = PLANILLA_COLUMNS.map((column) => column.key);
  if (
    !Array.isArray(stored) ||
    stored.length !== keys.length ||
    new Set(stored).size !== keys.length ||
    !stored.every((key) => typeof key === "string" && keys.includes(key))
  ) {
    return keys;
  }
  return stored as string[];
}

// The order the header row shows, or null when a header cell is not a column
// label (the sheet puts the labels back right after).
export function columnOrderFromLabels(labels: string[]): string[] | null {
  const order = labels.map(
    (label) => PLANILLA_COLUMNS.find((column) => column.label === label)?.key ?? "",
  );
  const resolved = resolveColumnOrder(order);
  return resolved === order ? order : null;
}

export const PLANILLA_REQUIRED_FOR_NEW = ["fecha", "hora", "local", "visitante"] as const;

export type PlanillaValues = Record<string, string>;

export type PlanillaRow = {
  matchId: string;
  values: PlanillaValues;
  attendance: Record<string, AttendanceState>;
  // yyyy-MM-dd in the Partido's timezone. The first row of each day carries the
  // day divider, and the sheet opens on today's first row.
  dayKey: string;
  dayStart: boolean;
};

export type PlanillaPerson = {
  id: string;
  name: string;
  functions: PersonFunctionKey[];
};

function assignmentFor(match: MatchListItem, roleName: string) {
  return match.assignments.find((item) => item.role.name === roleName) ?? null;
}

export function toPlanillaRows(matches: MatchListItem[]): PlanillaRow[] {
  return matches.map((match, index) => {
    const day = formatMatchDate(match.kickoff_at, match.timezone, "yyyy-MM-dd");
    const previous = matches[index - 1];
    const dayStart =
      index > 0 &&
      formatMatchDate(previous.kickoff_at, previous.timezone, "yyyy-MM-dd") !== day;

    const values: PlanillaValues = {
      matchId: match.id,
      fecha: formatMatchDate(match.kickoff_at, match.timezone, "dd/MM/yyyy"),
      hora: formatMatchDate(match.kickoff_at, match.timezone, "HH:mm"),
      modo: normalizeProductionMode(match.production_mode) ?? "",
      codigo: match.production_code ?? "",
      liga: match.competition ?? "",
      local: match.home_team ?? "",
      visitante: match.away_team ?? "",
      relatos: normalizeCommentaryPlan(match.commentary_plan),
      transporte: match.transport?.trim() ?? "",
      observacion: match.notes?.trim() ?? "",
    };
    const attendance: Record<string, AttendanceState> = {};

    for (const column of PLANILLA_COLUMNS) {
      if (column.kind !== "role") {
        continue;
      }
      const assignment = assignmentFor(match, column.roleName);
      const name =
        assignment?.person?.full_name ??
        (column.roleName === "Responsable" ? match.owner?.full_name : null) ??
        "";
      values[column.key] = name;
      attendance[column.key] = assignment
        ? getAttendanceState(assignment.attendance_response, assignment.person_id)
        : null;
    }

    return { matchId: match.id, values, attendance, dayKey: day, dayStart };
  });
}

// The row the sheet opens on: today's first Partido, or the next day with
// Partidos when today has none. -1 when the whole list is in the past.
export function findTodayRowIndex(rows: PlanillaRow[], todayKey: string) {
  return rows.findIndex((row) => row.dayKey >= todayKey);
}

export function peopleForRole(
  people: PlanillaPerson[],
  roleName: StaffRoleName,
): PlanillaPerson[] {
  const functionKey = roleNameToFunctionKey(roleName);
  return functionKey
    ? people.filter((person) => person.functions.includes(functionKey))
    : people;
}

// "5/11/2026", "05/11/26", "5-11" → "2026-11-05". The year defaults to the
// Planilla's month so producers can type day/month only.
export function parseDateCell(raw: string, fallbackYear: number): string | null {
  const match = raw.trim().match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/);
  if (!match) {
    return null;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3]
    ? match[3].length === 2
      ? 2000 + Number(match[3])
      : Number(match[3])
    : fallbackYear;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatDateCell(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

// "21", "2130", "21:30", "21.30", "9:05" → "21:00", "21:30", "09:05".
export function parseTimeCell(raw: string): string | null {
  const match = raw.trim().match(/^(\d{1,2})(?:[:.hH]?(\d{2}))?$/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export type PlanillaCellEdit =
  | { kind: "field"; field: PlanillaMatchField; value: string }
  | { kind: "role"; roleName: StaffRoleName; personId: string | null };

export type PlanillaEdit = PlanillaCellEdit & { matchId: string };

export type PlanillaLookups = {
  people: PlanillaPerson[];
  leagues: string[];
  teams: string[];
  year: number;
};

// A typed cell either becomes the value to store (normalized, so the sheet can
// show it back exactly) or an error explaining why it was rejected.
export type PlanillaCellResult =
  | { ok: true; display: string; edit: PlanillaCellEdit }
  | { ok: false; error: string };

function findByName<T>(items: T[], name: string, nameOf: (item: T) => string) {
  const key = normalizeText(name);
  return items.find((item) => normalizeText(nameOf(item)) === key) ?? null;
}

export function readPlanillaCell(
  column: PlanillaColumn,
  raw: string,
  lookups: PlanillaLookups,
): PlanillaCellResult {
  const value = raw.trim();

  if (column.kind === "id") {
    return { ok: false, error: "La columna id no se edita." };
  }

  if (column.kind === "role") {
    if (!value) {
      return {
        ok: true,
        display: "",
        edit: { kind: "role", roleName: column.roleName, personId: null },
      };
    }
    const person = findByName(lookups.people, value, (item) => item.name);
    if (!person) {
      return { ok: false, error: `«${value}» no está en Personas.` };
    }
    if (!peopleForRole([person], column.roleName).length) {
      return {
        ok: false,
        error: `${person.name} no tiene la función para ${column.label}.`,
      };
    }
    return {
      ok: true,
      display: person.name,
      edit: { kind: "role", roleName: column.roleName, personId: person.id },
    };
  }

  const fieldEdit = (display: string, stored = display): PlanillaCellResult => ({
    ok: true,
    display,
    edit: { kind: "field", field: column.field, value: stored },
  });

  switch (column.input) {
    case "date": {
      const iso = parseDateCell(value, lookups.year);
      return iso
        ? fieldEdit(formatDateCell(iso), iso)
        : { ok: false, error: `Fecha inválida «${value}». Usá dd/mm/aaaa.` };
    }
    case "time": {
      const time = parseTimeCell(value);
      return time
        ? fieldEdit(time)
        : { ok: false, error: `Hora inválida «${value}». Usá hh:mm.` };
    }
    case "list": {
      if (!value) {
        return fieldEdit("");
      }
      const option = findByName([...(column.options ?? [])], value, (item) => item);
      return option
        ? fieldEdit(option)
        : { ok: false, error: `«${value}» no es una opción de ${column.label}.` };
    }
    case "league": {
      if (!value) {
        return fieldEdit("");
      }
      const league = findByName(lookups.leagues, value, (item) => item);
      return league
        ? fieldEdit(league)
        : { ok: false, error: `La liga «${value}» no existe. Creala en Ligas.` };
    }
    case "team": {
      if (!value) {
        return { ok: false, error: `${column.label} no puede quedar vacío.` };
      }
      const team = findByName(lookups.teams, value, (item) => item);
      return team
        ? fieldEdit(team)
        : { ok: false, error: `El equipo «${value}» no existe. Cargalo en Equipos.` };
    }
    case "text":
      return fieldEdit(value);
  }
}

export type PlanillaNewMatch = {
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  competition: string | null;
  productionMode: string | null;
  productionCode: string | null;
  commentaryPlan: string | null;
  transport: string | null;
  notes: string | null;
  staff: Array<{ roleName: StaffRoleName; personId: string }>;
};

export function isPlanillaRowReadyToCreate(values: PlanillaValues) {
  return PLANILLA_REQUIRED_FOR_NEW.every((key) => values[key]?.trim());
}

// Reads a whole new row: every cell must be valid before the Partido is made,
// so a half-typed row never lands in the database.
export function readPlanillaNewRow(
  values: PlanillaValues,
  lookups: PlanillaLookups,
):
  | { ok: true; match: PlanillaNewMatch; display: PlanillaValues }
  | { ok: false; error: string } {
  const display: PlanillaValues = {};
  const fields: Partial<Record<PlanillaMatchField, string>> = {};
  const staff: PlanillaNewMatch["staff"] = [];

  for (const column of PLANILLA_COLUMNS) {
    if (column.kind === "id") {
      continue;
    }
    const raw = values[column.key] ?? "";
    if (!raw.trim()) {
      display[column.key] = "";
      continue;
    }
    const result = readPlanillaCell(column, raw, lookups);
    if (!result.ok) {
      return result;
    }
    display[column.key] = result.display;
    if (result.edit.kind === "field") {
      fields[result.edit.field] = result.edit.value;
    } else if (result.edit.personId) {
      staff.push({ roleName: result.edit.roleName, personId: result.edit.personId });
    }
  }

  if (!fields.kickoffDate || !fields.kickoffTime || !fields.homeTeam || !fields.awayTeam) {
    return { ok: false, error: "Faltan Fecha, Hora, Local o Visitante." };
  }

  return {
    ok: true,
    display,
    match: {
      date: fields.kickoffDate,
      time: fields.kickoffTime,
      homeTeam: fields.homeTeam,
      awayTeam: fields.awayTeam,
      competition: fields.competition || null,
      productionMode: fields.productionMode || null,
      productionCode: fields.productionCode || null,
      commentaryPlan: fields.commentaryPlan || null,
      transport: fields.transport || null,
      notes: fields.notes || null,
      staff,
    },
  };
}
