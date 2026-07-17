"use server";

import { revalidatePath } from "next/cache";

import {
  getRedirectTarget,
  redirectWithNotice,
  rethrowNavigationError,
} from "@/app/actions/helpers";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

import type { Database } from "@/lib/database.types";
import {
  MATCH_STATUS_OPTIONS,
  normalizeCommentaryPlan,
  normalizeProductionMode,
} from "@/lib/constants";
import { buildKickoffAt, formatMatchDate } from "@/lib/date";
import { db } from "@/lib/db/client";
import {
  assignments as assignmentsTable,
  matches as matchesTable,
  personFunctions as personFunctionsTable,
  roles as rolesTable,
} from "@/lib/db/schema";
import { type PersonFunctionKey, roleNameToFunctionKey } from "@/lib/functions";
import { requireEditor, requireUserContext } from "@/lib/auth";
import { stampInsert, stampUpdate, writeAudit } from "@/lib/audit";
import { recordAttendanceConfirmation } from "@/lib/data/attendance";
import { shouldResetAttendance } from "@/lib/attendance";
import { ensureErrorMessage, maybeNull, pickFirstString } from "@/lib/utils";

// stampInsert/stampUpdate return snake_case payloads; Drizzle .values()/.set()
// take camelCase. These mappers translate, copying only keys actually present
// so an UPDATE never touches an omitted column (upsert-retains-on-conflict).
type MatchColumns = Partial<typeof matchesTable.$inferInsert>;

const MATCH_COLUMN_MAP = {
  competition: "competition",
  production_code: "productionCode",
  production_mode: "productionMode",
  status: "status",
  home_team: "homeTeam",
  away_team: "awayTeam",
  venue: "venue",
  commentary_plan: "commentaryPlan",
  transport: "transport",
  kickoff_at: "kickoffAt",
  duration_minutes: "durationMinutes",
  timezone: "timezone",
  owner_id: "ownerId",
  notes: "notes",
  created_by: "createdBy",
  updated_by: "updatedBy",
  created_at: "createdAt",
  updated_at: "updatedAt",
} as const;

function toMatchColumns(payload: Record<string, unknown>): MatchColumns {
  const out: Record<string, unknown> = {};
  for (const [snake, camel] of Object.entries(MATCH_COLUMN_MAP)) {
    if (snake in payload) {
      out[camel] = payload[snake];
    }
  }
  return out as MatchColumns;
}

type AssignmentColumns = Partial<typeof assignmentsTable.$inferInsert>;

const ASSIGNMENT_COLUMN_MAP = {
  match_id: "matchId",
  role_id: "roleId",
  person_id: "personId",
  confirmed: "confirmed",
  notes: "notes",
  attendance_confirmed_at: "attendanceConfirmedAt",
  attendance_response: "attendanceResponse",
  attendance_note: "attendanceNote",
  created_by: "createdBy",
  updated_by: "updatedBy",
  created_at: "createdAt",
  updated_at: "updatedAt",
} as const;

function toAssignmentColumns(payload: Record<string, unknown>): AssignmentColumns {
  const out: Record<string, unknown> = {};
  for (const [snake, camel] of Object.entries(ASSIGNMENT_COLUMN_MAP)) {
    if (snake in payload) {
      out[camel] = payload[snake];
    }
  }
  return out as AssignmentColumns;
}

const STAFF_ROLE_FIELD_MAP = [
  {
    fields: ["responsableId", "responsableEnCanchaId", "ownerId"],
    roleName: "Responsable",
  },
  { fields: ["realizadorId"], roleName: "Realizador" },
  {
    fields: ["graphicsOperatorId", "graficaId"],
    roleName: "Operador de Grafica",
  },
  {
    fields: ["controlOperatorId", "controlId"],
    roleName: "Operador de Control",
  },
  { fields: ["supportTechId", "soporteId"], roleName: "Soporte tecnico" },
  { fields: ["camera1Id", "camara1Id"], roleName: "Camara 1" },
  { fields: ["camera2Id", "camara2Id"], roleName: "Camara 2" },
  { fields: ["camera3Id", "camara3Id"], roleName: "Camara 3" },
  { fields: ["camera4Id", "camara4Id"], roleName: "Camara 4" },
  { fields: ["camera5Id", "camara5Id"], roleName: "Camara 5" },
  { fields: ["relatorId"], roleName: "Relator" },
  {
    fields: ["commentator1Id", "comentario1Id"],
    roleName: "Comentario 1",
  },
  {
    fields: ["commentator2Id", "comentario2Id"],
    roleName: "Comentario 2",
  },
] as const;

type MatchUpdate = Database["public"]["Tables"]["matches"]["Update"];

function assertMatchStatus(value: string) {
  if (!MATCH_STATUS_OPTIONS.includes(value as (typeof MATCH_STATUS_OPTIONS)[number])) {
    return "Pendiente";
  }

  return value as (typeof MATCH_STATUS_OPTIONS)[number];
}

function assertProductionMode(value: string) {
  return normalizeProductionMode(value);
}

function getGridRedirectForCreatedMatch(formData: FormData, fallback: string) {
  const url = new URL(fallback, "http://localhost");
  const createdDate = String(formData.get("date") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();

  url.pathname = "/grid";
  url.searchParams.set("view", "day");

  if (createdDate) {
    url.searchParams.set("date", createdDate);
  }

  if (timezone) {
    url.searchParams.set("timezone", timezone);
  }

  for (const key of ["q", "league", "mode", "status", "owner", "intent", "notice"]) {
    url.searchParams.delete(key);
  }

  return `${url.pathname}${url.search}`;
}

function getCreateOwnerId(formData: FormData) {
  return maybeNull(
    pickFirstString([
      formData.get("responsableId"),
      formData.get("responsableEnCanchaId"),
      formData.get("ownerId"),
    ]),
  );
}

function buildStaffAssignments(params: {
  matchId: string;
  formData: FormData;
  roleIdsByName: Map<string, string>;
}) {
  return STAFF_ROLE_FIELD_MAP.flatMap(({ fields, roleName }) => {
    const personId = maybeNull(
      pickFirstString(fields.map((field) => params.formData.get(field))),
    );
    const roleId = params.roleIdsByName.get(roleName);

    if (!personId || !roleId) {
      return [];
    }

    return {
      match_id: params.matchId,
      role_id: roleId,
      person_id: personId,
      confirmed: false,
      notes: null,
    };
  });
}

// Server-side mirror of the strict UI filter: a person may only be assigned to
// a role whose function they hold (person_functions). Rejects anomalous writes
// (stale form, replay) so the "assigned ⟹ qualified" invariant holds in the DB.
function unqualifiedAssignmentNotice(roleName: string, functionKey: PersonFunctionKey) {
  return `No se puede asignar: la persona seleccionada no tiene la función «${functionKey}» para «${roleName}».`;
}

async function findUnqualifiedAssignment(
  rows: Array<{ personId: string | null; roleName: string }>,
): Promise<{ roleName: string; functionKey: PersonFunctionKey } | null> {
  const checks = rows.flatMap((row) => {
    if (!row.personId) {
      return [];
    }

    const functionKey = roleNameToFunctionKey(row.roleName);

    // Roles with no mapped function (custom roles) carry no capability gate.
    return functionKey
      ? [{ personId: row.personId, roleName: row.roleName, functionKey }]
      : [];
  });

  if (!checks.length) {
    return null;
  }

  const personIds = [...new Set(checks.map((check) => check.personId))];
  const data = await db
    .select({
      person_id: personFunctionsTable.personId,
      function_key: personFunctionsTable.functionKey,
    })
    .from(personFunctionsTable)
    .where(inArray(personFunctionsTable.personId, personIds));

  const held = new Set(data.map((row) => `${row.person_id}:${row.function_key}`));

  return (
    checks.find((check) => !held.has(`${check.personId}:${check.functionKey}`)) ?? null
  );
}

function collectStaffAssignmentChecks(formData: FormData) {
  return STAFF_ROLE_FIELD_MAP.map(({ fields, roleName }) => ({
    personId: maybeNull(pickFirstString(fields.map((field) => formData.get(field)))),
    roleName,
  }));
}

// Postgres unique_violation; surfaced by the postgres driver on the error `code`.
function isUniqueViolation(error: unknown): boolean {
  return Boolean(error) && (error as { code?: string }).code === "23505";
}

function duplicateProductionCodeMessage(productionCode: string) {
  return `El ID "${productionCode}" ya existe en la base de datos. Probá con otro.`;
}

async function productionCodeExists(
  productionCode: string,
  excludeMatchId?: string,
) {
  const conditions = [eq(matchesTable.productionCode, productionCode)];
  if (excludeMatchId) {
    conditions.push(ne(matchesTable.id, excludeMatchId));
  }

  const rows = await db
    .select({ id: matchesTable.id })
    .from(matchesTable)
    .where(and(...conditions))
    .limit(1);

  return rows.length > 0;
}

export async function createMatchAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/grid");
  const createdMatchGridRedirect = getGridRedirectForCreatedMatch(formData, redirectTo);
  const ctx = await requireEditor();

  try {
    const kickoffAt = buildKickoffAt({
      date: String(formData.get("date") ?? ""),
      time: String(formData.get("time") ?? ""),
      timezone: String(formData.get("timezone") ?? ""),
    });

    const productionCode = maybeNull(String(formData.get("productionCode") ?? ""));

    if (productionCode && (await productionCodeExists(productionCode))) {
      redirectWithNotice({
        redirectTo,
        intent: "error",
        notice: duplicateProductionCodeMessage(productionCode),
      });
    }

    const unqualified = await findUnqualifiedAssignment(
      collectStaffAssignmentChecks(formData),
    );

    if (unqualified) {
      redirectWithNotice({
        redirectTo,
        intent: "error",
        notice: unqualifiedAssignmentNotice(unqualified.roleName, unqualified.functionKey),
      });
    }

    const stampedMatch = stampInsert(ctx, {
      competition: maybeNull(String(formData.get("competition") ?? "")),
      production_code: productionCode,
      production_mode: assertProductionMode(
        String(formData.get("productionMode") ?? ""),
      ),
      status: assertMatchStatus(String(formData.get("status") ?? "Pendiente")),
      home_team: String(formData.get("homeTeam") ?? "").trim(),
      away_team: String(formData.get("awayTeam") ?? "").trim(),
      venue: maybeNull(String(formData.get("venue") ?? "")),
      commentary_plan: maybeNull(String(formData.get("commentaryPlan") ?? "")),
      transport: maybeNull(String(formData.get("transport") ?? "")),
      kickoff_at: kickoffAt,
      duration_minutes: Number(formData.get("durationMinutes") ?? 150),
      timezone: String(formData.get("timezone") ?? ""),
      owner_id: getCreateOwnerId(formData),
      notes: maybeNull(String(formData.get("notes") ?? "")),
    });

    let createdMatchId: string | undefined;
    try {
      const rows = await db
        .insert(matchesTable)
        .values(toMatchColumns(stampedMatch) as typeof matchesTable.$inferInsert)
        .returning({ id: matchesTable.id });
      createdMatchId = rows[0]?.id;
    } catch (error) {
      if (isUniqueViolation(error) && productionCode) {
        redirectWithNotice({
          redirectTo,
          intent: "error",
          notice: duplicateProductionCodeMessage(productionCode),
        });
      }
      throw error;
    }

    if (!createdMatchId) {
      throw new Error("No pudimos crear el partido.");
    }

    await writeAudit(ctx, {
      table: "matches",
      recordId: createdMatchId,
      action: "INSERT",
      before: null,
      after: { id: createdMatchId },
    });

    const roleNames = STAFF_ROLE_FIELD_MAP.map((item) => item.roleName);
    const roleRows = await db
      .select({ id: rolesTable.id, name: rolesTable.name })
      .from(rolesTable)
      .where(inArray(rolesTable.name, roleNames));

    const roleIdsByName = new Map(roleRows.map((role) => [role.name, role.id]));

    const assignments = buildStaffAssignments({
      matchId: createdMatchId,
      formData,
      roleIdsByName,
    });

    const notify: string[] = [];

    if (assignments.length) {
      const assignmentRows = await db
        .insert(assignmentsTable)
        .values(
          assignments.map(
            (a) =>
              toAssignmentColumns(stampInsert(ctx, a)) as typeof assignmentsTable.$inferInsert,
          ),
        )
        .onConflictDoUpdate({
          target: [assignmentsTable.matchId, assignmentsTable.roleId],
          set: {
            personId: sql`excluded.person_id`,
            confirmed: sql`excluded.confirmed`,
            notes: sql`excluded.notes`,
            createdBy: sql`excluded.created_by`,
            updatedBy: sql`excluded.updated_by`,
            createdAt: sql`excluded.created_at`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
        .returning({
          id: assignmentsTable.id,
          person_id: assignmentsTable.personId,
        });

      for (const row of assignmentRows) {
        if (row.person_id) {
          notify.push(row.id);
        }
      }

      await writeAudit(ctx, {
        table: "assignments",
        recordId: createdMatchId,
        matchId: createdMatchId,
        action: "INSERT",
        before: null,
        after: { match_id: createdMatchId, count: assignments.length },
      });
    }

    revalidatePath("/grid");
    revalidatePath(`/match/${createdMatchId}`);
    revalidatePath(`/match/${createdMatchId}/notificar`);
    redirectWithNotice({
      redirectTo: notify.length
        ? `/match/${createdMatchId}`
        : createdMatchGridRedirect,
      intent: "success",
      notice: "Partido creado.",
      notify,
    });
  } catch (error) {
    rethrowNavigationError(error);
    redirectWithNotice({
      redirectTo,
      intent: "error",
      notice: ensureErrorMessage(error),
    });
  }
}

export async function updateMatchAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/grid");
  const ctx = await requireEditor();

  const matchId = String(formData.get("matchId") ?? "");

  try {
    const unqualified = await findUnqualifiedAssignment(
      collectStaffAssignmentChecks(formData),
    );

    if (unqualified) {
      redirectWithNotice({
        redirectTo,
        intent: "error",
        notice: unqualifiedAssignmentNotice(unqualified.roleName, unqualified.functionKey),
      });
    }

    const kickoffAt = buildKickoffAt({
      date: String(formData.get("date") ?? ""),
      time: String(formData.get("time") ?? ""),
      timezone: String(formData.get("timezone") ?? ""),
    });
    const payload: MatchUpdate = {
      competition: maybeNull(String(formData.get("competition") ?? "")),
      production_mode: assertProductionMode(
        String(formData.get("productionMode") ?? ""),
      ),
      status: assertMatchStatus(String(formData.get("status") ?? "Pendiente")),
      home_team: String(formData.get("homeTeam") ?? "").trim(),
      away_team: String(formData.get("awayTeam") ?? "").trim(),
      venue: maybeNull(String(formData.get("venue") ?? "")),
      kickoff_at: kickoffAt,
      duration_minutes: Number(formData.get("durationMinutes") ?? 150),
      timezone: String(formData.get("timezone") ?? ""),
      owner_id: getCreateOwnerId(formData),
      notes: maybeNull(String(formData.get("notes") ?? "")),
    };

    if (formData.has("productionCode")) {
      const productionCode = maybeNull(String(formData.get("productionCode") ?? ""));

      if (
        productionCode &&
        (await productionCodeExists(productionCode, matchId))
      ) {
        redirectWithNotice({
          redirectTo,
          intent: "error",
          notice: duplicateProductionCodeMessage(productionCode),
        });
      }

      payload.production_code = productionCode;
    }

    if (formData.has("commentaryPlan")) {
      payload.commentary_plan = maybeNull(String(formData.get("commentaryPlan") ?? ""));
    }

    if (formData.has("transport")) {
      payload.transport = maybeNull(String(formData.get("transport") ?? ""));
    }

    try {
      await db
        .update(matchesTable)
        .set(toMatchColumns(stampUpdate(ctx, payload)))
        .where(eq(matchesTable.id, matchId));
    } catch (error) {
      if (isUniqueViolation(error) && payload.production_code) {
        redirectWithNotice({
          redirectTo,
          intent: "error",
          notice: duplicateProductionCodeMessage(payload.production_code),
        });
      }
      throw error;
    }

    await writeAudit(ctx, {
      table: "matches",
      recordId: matchId,
      action: "UPDATE",
      before: null,
      after: { id: matchId, ...payload },
    });

    const roleNames = STAFF_ROLE_FIELD_MAP.map((item) => item.roleName);
    const roleRows = await db
      .select({ id: rolesTable.id, name: rolesTable.name })
      .from(rolesTable)
      .where(inArray(rolesTable.name, roleNames));

    const roleIdsByName = new Map(roleRows.map((role) => [role.name, role.id]));
    const roleIds = [...roleIdsByName.values()];
    const priorAssignmentKeys = new Set<string>();

    if (roleIds.length) {
      const priorRows = await db
        .select({
          role_id: assignmentsTable.roleId,
          person_id: assignmentsTable.personId,
        })
        .from(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.matchId, matchId),
            inArray(assignmentsTable.roleId, roleIds),
          ),
        );

      for (const row of priorRows) {
        if (row.person_id) {
          priorAssignmentKeys.add(`${row.role_id}:${row.person_id}`);
        }
      }

      await db
        .delete(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.matchId, matchId),
            inArray(assignmentsTable.roleId, roleIds),
          ),
        );
    }

    const assignments = buildStaffAssignments({
      matchId,
      formData,
      roleIdsByName,
    });

    const notify: string[] = [];

    if (assignments.length) {
      const assignmentRows = await db
        .insert(assignmentsTable)
        .values(
          assignments.map(
            (a) =>
              toAssignmentColumns(stampInsert(ctx, a)) as typeof assignmentsTable.$inferInsert,
          ),
        )
        .onConflictDoUpdate({
          target: [assignmentsTable.matchId, assignmentsTable.roleId],
          set: {
            personId: sql`excluded.person_id`,
            confirmed: sql`excluded.confirmed`,
            notes: sql`excluded.notes`,
            createdBy: sql`excluded.created_by`,
            updatedBy: sql`excluded.updated_by`,
            createdAt: sql`excluded.created_at`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
        .returning({
          id: assignmentsTable.id,
          role_id: assignmentsTable.roleId,
          person_id: assignmentsTable.personId,
        });

      for (const row of assignmentRows) {
        if (row.person_id && !priorAssignmentKeys.has(`${row.role_id}:${row.person_id}`)) {
          notify.push(row.id);
        }
      }

      await writeAudit(ctx, {
        table: "assignments",
        recordId: matchId,
        matchId,
        action: "UPDATE",
        before: null,
        after: { match_id: matchId, count: assignments.length },
      });
    }

    revalidatePath("/grid");
    revalidatePath(`/match/${matchId}`);
    redirectWithNotice({
      redirectTo: notify.length ? `/match/${matchId}` : redirectTo,
      intent: "success",
      notice: "Partido actualizado.",
      notify,
    });
  } catch (error) {
    rethrowNavigationError(error);
    redirectWithNotice({
      redirectTo,
      intent: "error",
      notice: ensureErrorMessage(error),
    });
  }
}

export async function quickUpdateMatchFieldAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/grid");
  const ctx = await requireEditor();

  const matchId = String(formData.get("matchId") ?? "");
  const field = String(formData.get("field") ?? "");
  const rawValue = String(formData.get("value") ?? "").trim();

  try {
    const payload: MatchUpdate = {};

    switch (field) {
      case "homeTeam":
        payload.home_team = rawValue;
        break;
      case "awayTeam":
        payload.away_team = rawValue;
        break;
      case "competition":
        payload.competition = maybeNull(rawValue);
        break;
      case "productionMode":
        payload.production_mode = assertProductionMode(rawValue);
        break;
      case "status":
        payload.status = assertMatchStatus(rawValue);
        break;
      case "productionCode":
        payload.production_code = maybeNull(rawValue);
        break;
      case "commentaryPlan":
        payload.commentary_plan = maybeNull(normalizeCommentaryPlan(rawValue));
        break;
      case "transport":
        payload.transport = maybeNull(rawValue);
        break;
      case "notes":
        payload.notes = maybeNull(rawValue);
        break;
      case "kickoffTime": {
        if (!/^\d{2}:\d{2}$/.test(rawValue)) {
          throw new Error("Hora inválida.");
        }

        const matchRows = await db
          .select({
            kickoff_at: matchesTable.kickoffAt,
            timezone: matchesTable.timezone,
          })
          .from(matchesTable)
          .where(eq(matchesTable.id, matchId))
          .limit(1);

        const matchRow = matchRows[0];
        if (!matchRow) {
          throw new Error("No se encontró el partido.");
        }

        payload.kickoff_at = buildKickoffAt({
          date: formatMatchDate(
            matchRow.kickoff_at,
            matchRow.timezone,
            "yyyy-MM-dd",
          ),
          time: rawValue,
          timezone: matchRow.timezone,
        });
        break;
      }
      default:
        throw new Error("Campo de edición rápida no soportado.");
    }

    await db
      .update(matchesTable)
      .set(toMatchColumns(stampUpdate(ctx, payload)))
      .where(eq(matchesTable.id, matchId));

    await writeAudit(ctx, {
      table: "matches",
      recordId: matchId,
      action: "UPDATE",
      before: null,
      after: { id: matchId, ...payload },
    });

    revalidatePath("/grid");
    revalidatePath(`/match/${matchId}`);
    redirectWithNotice({
      redirectTo,
      intent: "success",
      notice: "Partido actualizado.",
    });
  } catch (error) {
    rethrowNavigationError(error);
    redirectWithNotice({
      redirectTo,
      intent: "error",
      notice: ensureErrorMessage(error),
    });
  }
}

export async function deleteMatchAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/grid");
  const ctx = await requireEditor();
  const matchId = String(formData.get("matchId") ?? "");

  try {
    await db.delete(matchesTable).where(eq(matchesTable.id, matchId));

    await writeAudit(ctx, {
      table: "matches",
      recordId: matchId,
      action: "DELETE",
      before: { id: matchId },
      after: null,
    });

    revalidatePath("/grid");
    redirectWithNotice({
      redirectTo,
      intent: "success",
      notice: "Partido eliminado.",
    });
  } catch (error) {
    rethrowNavigationError(error);
    redirectWithNotice({
      redirectTo,
      intent: "error",
      notice: ensureErrorMessage(error),
    });
  }
}

// Attendance confirmation by the assigned person themselves (PRD #7). Auth-only
// (NOT requireEditor): a collaborator must pass. Ownership + match-window are
// enforced inside recordAttendanceConfirmation; this wrapper only surfaces the
// outcome as a notice. Lives in /mi-jornada, never the editor match view.
export async function setAttendanceConfirmationAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/mi-jornada");
  const ctx = await requireUserContext();

  try {
    const assignmentId = String(formData.get("assignmentId") ?? "");
    const rawResponse = String(formData.get("response") ?? "");
    const response =
      rawResponse === "attending" || rawResponse === "declined"
        ? rawResponse
        : null;
    const note = maybeNull(String(formData.get("note") ?? ""));

    const outcome = await recordAttendanceConfirmation(ctx, {
      assignmentId,
      response,
      note,
    });

    if (!outcome.ok) {
      redirectWithNotice({
        redirectTo,
        intent: "error",
        notice: "No pudimos actualizar tu confirmación de asistencia.",
      });
    }

    revalidatePath(redirectTo);
    redirectWithNotice({
      redirectTo,
      intent: "success",
      notice:
        response === "attending"
          ? "Confirmaste tu asistencia."
          : response === "declined"
            ? "Avisaste que no asistirás."
            : "Marcaste tu asistencia como pendiente.",
    });
  } catch (error) {
    rethrowNavigationError(error);
    redirectWithNotice({
      redirectTo,
      intent: "error",
      notice: ensureErrorMessage(error),
    });
  }
}

export async function upsertAssignmentAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/grid");
  const ctx = await requireEditor();

  try {
    const assignmentMatchId = String(formData.get("matchId") ?? "");
    const assignmentRoleId = String(formData.get("roleId") ?? "");
    const incomingPersonId = maybeNull(String(formData.get("personId") ?? ""));

    if (incomingPersonId) {
      const roleRows = await db
        .select({ name: rolesTable.name })
        .from(rolesTable)
        .where(eq(rolesTable.id, assignmentRoleId))
        .limit(1);

      const roleName = roleRows[0]?.name;
      const unqualified = roleName
        ? await findUnqualifiedAssignment([
            { personId: incomingPersonId, roleName },
          ])
        : null;

      if (unqualified) {
        redirectWithNotice({
          redirectTo,
          intent: "error",
          notice: unqualifiedAssignmentNotice(unqualified.roleName, unqualified.functionKey),
        });
      }
    }

    const priorRows = await db
      .select({ person_id: assignmentsTable.personId })
      .from(assignmentsTable)
      .where(
        and(
          eq(assignmentsTable.matchId, assignmentMatchId),
          eq(assignmentsTable.roleId, assignmentRoleId),
        ),
      )
      .limit(1);
    const priorPersonId = priorRows[0]?.person_id ?? null;

    // Reassigning a role to a different person invalidates the prior person's
    // attendance confirmation (PRD #7). Columns omitted from an upsert payload
    // retain their existing value on conflict, so we only null it on a real
    // person change; same-person edits (notes, etc.) keep the confirmation.
    const assignmentPayload: Database["public"]["Tables"]["assignments"]["Insert"] =
      {
        match_id: assignmentMatchId,
        role_id: assignmentRoleId,
        person_id: incomingPersonId,
        confirmed: String(formData.get("confirmed") ?? "") === "on",
        notes: maybeNull(String(formData.get("notes") ?? "")),
      };

    if (shouldResetAttendance(priorPersonId, incomingPersonId)) {
      assignmentPayload.attendance_confirmed_at = null;
    }

    const cols = toAssignmentColumns(stampInsert(ctx, assignmentPayload));
    // ON CONFLICT updates every provided non-target column (mirrors PostgREST
    // upsert); the omitted attendance columns retain their value on conflict.
    const { matchId: _conflictMatchId, roleId: _conflictRoleId, ...updateSet } =
      cols;
    void _conflictMatchId;
    void _conflictRoleId;

    const rows = await db
      .insert(assignmentsTable)
      .values(cols as typeof assignmentsTable.$inferInsert)
      .onConflictDoUpdate({
        target: [assignmentsTable.matchId, assignmentsTable.roleId],
        set: updateSet,
      })
      .returning({
        id: assignmentsTable.id,
        match_id: assignmentsTable.matchId,
      });

    const row = rows[0];
    if (!row) {
      throw new Error("No pudimos guardar la asignación.");
    }

    await writeAudit(ctx, {
      table: "assignments",
      recordId: row.id,
      matchId: row.match_id,
      action: "INSERT",
      before: null,
      after: { id: row.id, match_id: row.match_id },
    });

    const notify =
      incomingPersonId && incomingPersonId !== priorPersonId ? [row.id] : [];

    revalidatePath(redirectTo);
    redirectWithNotice({
      redirectTo: notify.length ? `/match/${assignmentMatchId}` : redirectTo,
      intent: "success",
      notice: "Asignación actualizada.",
      notify,
    });
  } catch (error) {
    rethrowNavigationError(error);
    redirectWithNotice({
      redirectTo,
      intent: "error",
      notice: ensureErrorMessage(error),
    });
  }
}
