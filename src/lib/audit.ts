import { PRODUCTION_SHORT_LABEL } from "@/lib/constants";
import type { Json } from "@/lib/database.types";
import { getRoleDisplayName } from "@/lib/display";
import type { AuditEntry, AssignmentDetail } from "@/lib/types";

const FIELD_LABELS: Record<string, string> = {
  competition: "Liga",
  production_mode: PRODUCTION_SHORT_LABEL,
  status: "Estado",
  home_team: "Local",
  away_team: "Visitante",
  venue: "Sede",
  kickoff_at: "Inicio",
  duration_minutes: "Duración",
  timezone: "Zona horaria",
  owner_id: "Responsable",
  notes: "Observaciones",
  person_id: "Persona",
  confirmed: "Confirmado",
  role_id: "Rol",
  category: "Categoría",
  sort_order: "Orden",
  active: "Activo",
  full_name: "Nombre",
  phone: "Teléfono",
  email: "Email",
};

type LookupMaps = {
  people?: Map<string, string>;
  roles?: Map<string, string>;
};

function isObject(value: Json | null): value is Record<string, Json> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringifyValue(key: string, value: Json | undefined, lookup: LookupMaps) {
  if (typeof value === "string") {
    if (key === "person_id" && lookup.people?.has(value)) {
      return lookup.people.get(value) ?? value;
    }

    if (key === "role_id" && lookup.roles?.has(value)) {
      return lookup.roles.get(value) ?? value;
    }

    return value;
  }

  if (typeof value === "boolean") {
    return value ? "Sí" : "No";
  }

  if (value === null || value === undefined) {
    return "Vacío";
  }

  return JSON.stringify(value);
}

function getChangedFields(
  beforeValue: Json | null,
  afterValue: Json | null,
  lookup: LookupMaps,
) {
  if (!isObject(beforeValue) && !isObject(afterValue)) {
    return [];
  }

  const keys = new Set([
    ...Object.keys(isObject(beforeValue) ? beforeValue : {}),
    ...Object.keys(isObject(afterValue) ? afterValue : {}),
  ]);

  return [...keys]
    .filter(
      (key) =>
        !["id", "created_at", "updated_at", "created_by", "updated_by"].includes(
          key,
        ),
    )
    .filter((key) => {
      const beforeField = isObject(beforeValue) ? beforeValue[key] : undefined;
      const afterField = isObject(afterValue) ? afterValue[key] : undefined;

      return JSON.stringify(beforeField) !== JSON.stringify(afterField);
    })
    .map((key) => ({
      key,
      label: FIELD_LABELS[key] ?? key,
      before: stringifyValue(key, isObject(beforeValue) ? beforeValue[key] : undefined, lookup),
      after: stringifyValue(key, isObject(afterValue) ? afterValue[key] : undefined, lookup),
    }));
}

export function formatAuditEntry(
  entry: AuditEntry,
  options: {
    assignments?: AssignmentDetail[];
    people?: Map<string, string>;
  } = {},
) {
  const roleMap = new Map(
    (options.assignments ?? []).map((assignment) => [
      assignment.role.id,
      getRoleDisplayName(assignment.role.name),
    ]),
  );

  const changes = getChangedFields(entry.before, entry.after, {
    people: options.people,
    roles: roleMap,
  });

  const entityName =
    entry.table_name === "assignments"
      ? "asignación"
      : entry.table_name === "matches"
        ? "partido"
        : entry.table_name === "people"
          ? "persona"
          : "rol";

  const headline =
    entry.action === "INSERT"
      ? `Se creó ${entityName}`
      : entry.action === "DELETE"
        ? `Se eliminó ${entityName}`
        : `Se actualizó ${entityName}`;

  return {
    headline,
    changes,
  };
}
