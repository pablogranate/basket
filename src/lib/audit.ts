import type { UserContext } from "@/lib/auth";
import { PRODUCTION_SHORT_LABEL } from "@/lib/constants";
import type { Database, Json } from "@/lib/database.types";
import { db } from "@/lib/db/client";
import { auditLog as auditLogTable } from "@/lib/db/schema";
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

// ---------------------------------------------------------------------------
// App-side actor stamping + audit writer (AUTHZ-03)
//
// Ports the dropped Postgres triggers set_row_metadata + log_audit_event into
// the app layer. Once Wave 4 drops those triggers, auth.uid() is gone, so the
// app MUST set created_by/updated_by and write audit_log rows itself. A missed
// write site silently yields NULL changed_by post-teardown (Pitfall 1).
// ---------------------------------------------------------------------------

type AuditAction = Database["public"]["Tables"]["audit_log"]["Row"]["action"];

type WriteAuditArgs = {
  table: string;
  recordId: string;
  matchId?: string | null;
  action: AuditAction;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

const REDACTED_SECRET = "[redacted]";

function nowIso() {
  return new Date().toISOString();
}

// Mirrors set_row_metadata (INSERT branch): stamp the actor + timestamps,
// coalescing an existing created_at exactly like the trigger did.
export function stampInsert<T extends Record<string, unknown>>(
  ctx: UserContext,
  payload: T,
): T & {
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
} {
  const timestamp = nowIso();
  const existingCreatedAt =
    typeof payload.created_at === "string" ? payload.created_at : null;

  return {
    ...payload,
    created_by: ctx.profileId,
    updated_by: ctx.profileId,
    created_at: existingCreatedAt ?? timestamp,
    updated_at: timestamp,
  };
}

// Mirrors set_row_metadata (UPDATE branch): refresh updated_by + updated_at.
export function stampUpdate<T extends Record<string, unknown>>(
  ctx: UserContext,
  payload: T,
): T & { updated_by: string | null; updated_at: string } {
  return {
    ...payload,
    updated_by: ctx.profileId,
    updated_at: nowIso(),
  };
}

// log_audit_event match_id rule (lines 122-136): matches -> record id,
// assignments -> row match_id, else null.
function deriveAuditMatchId(args: WriteAuditArgs): string | null {
  if (args.table === "matches") {
    return args.recordId;
  }

  if (args.table === "assignments") {
    if (args.matchId) {
      return args.matchId;
    }

    const fromRow = args.after?.match_id ?? args.before?.match_id ?? null;

    return typeof fromRow === "string" && fromRow.length > 0 ? fromRow : null;
  }

  return args.matchId ?? null;
}

// Never persist secret columns in plaintext in the audit trail (CONCERNS LOW).
function redactAuditSecrets(
  payload: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!payload || !("secret_value" in payload)) {
    return payload;
  }

  return { ...payload, secret_value: REDACTED_SECRET };
}

// Ports log_audit_event to the app layer: every domain mutation writes one
// audit_log row with changed_by = ctx.profileId (NEVER NULL when an actor exists).
// On insert failure we log + rethrow — a silent audit failure is unacceptable.
export async function writeAudit(
  ctx: UserContext,
  args: WriteAuditArgs,
): Promise<void> {
  const isSettings = args.table === "app_settings";
  const before = isSettings ? redactAuditSecrets(args.before) : args.before;
  const after = isSettings ? redactAuditSecrets(args.after) : args.after;

  try {
    await db.insert(auditLogTable).values({
      tableName: args.table,
      recordId: args.recordId,
      matchId: deriveAuditMatchId(args),
      action: args.action,
      changedBy: ctx.profileId,
      before: (before ?? null) as Json,
      after: (after ?? null) as Json,
    });
  } catch (error) {
    console.error("[audit] failed to write audit_log row", {
      table: args.table,
      recordId: args.recordId,
      action: args.action,
      error,
    });
    throw error;
  }
}
