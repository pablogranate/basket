"use server";

import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { defineAction } from "@/lib/actions/define-action";
import {
  STAFF_ROLE_FIELD_MAP,
  assertMatchStatus,
  assertProductionMode,
  getGridRedirectForCreatedMatch,
  parseCreateMatch,
  parseDeleteMatch,
  parseQuickUpdateMatchField,
  parseSetAttendanceConfirmation,
  parseSetEncoderNumbers,
  parseUpdateMatch,
  parseUpsertAssignment,
  type StaffSelection,
} from "@/lib/actions/parse/matches";
import type { Database } from "@/lib/database.types";
import { normalizeCommentaryPlan } from "@/lib/constants";
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
import {
  recordAttendanceConfirmation,
  recordEncoderNumbers,
} from "@/lib/data/attendance";
import { shouldResetAttendance } from "@/lib/attendance";
import { isUniqueViolation } from "@/lib/db/errors";
import { maybeNull } from "@/lib/utils";

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

type MatchUpdate = Database["public"]["Tables"]["matches"]["Update"];

function buildStaffAssignments(params: {
  matchId: string;
  staffSelections: StaffSelection[];
  roleIdsByName: Map<string, string>;
}) {
  return params.staffSelections.flatMap(({ personId, roleName }) => {
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

async function loadStaffRoleIdsByName() {
  const roleNames = STAFF_ROLE_FIELD_MAP.map((item) => item.roleName);
  const roleRows = await db
    .select({ id: rolesTable.id, name: rolesTable.name })
    .from(rolesTable)
    .where(inArray(rolesTable.name, roleNames));

  return new Map(roleRows.map((role) => [role.name, role.id]));
}

const createMatch = defineAction({
  fallbackRedirect: "/grid",
  authz: requireEditor,
  parse: parseCreateMatch,
  async run(ctx, input, meta) {
    const kickoffAt = buildKickoffAt({
      date: input.date,
      time: input.time,
      timezone: input.timezone,
    });

    const productionCode = input.productionCode;

    if (productionCode && (await productionCodeExists(productionCode))) {
      return { error: duplicateProductionCodeMessage(productionCode) };
    }

    const unqualified = await findUnqualifiedAssignment(input.staffSelections);

    if (unqualified) {
      return {
        error: unqualifiedAssignmentNotice(
          unqualified.roleName,
          unqualified.functionKey,
        ),
      };
    }

    const stampedMatch = stampInsert(ctx, {
      competition: input.competition,
      production_code: productionCode,
      production_mode: input.productionMode,
      status: input.status,
      home_team: input.homeTeam,
      away_team: input.awayTeam,
      venue: input.venue,
      commentary_plan: input.commentaryPlan,
      transport: input.transport,
      kickoff_at: kickoffAt,
      duration_minutes: input.durationMinutes,
      timezone: input.timezone,
      owner_id: input.ownerId,
      notes: input.notes,
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
        return { error: duplicateProductionCodeMessage(productionCode) };
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

    const roleIdsByName = await loadStaffRoleIdsByName();

    const assignments = buildStaffAssignments({
      matchId: createdMatchId,
      staffSelections: input.staffSelections,
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

    return {
      notice: "Partido creado.",
      notify,
      redirectTo: notify.length
        ? `/match/${createdMatchId}`
        : getGridRedirectForCreatedMatch({
            fallback: meta.redirectTo,
            date: input.date,
            timezone: input.timezone,
          }),
      revalidate: [
        "/grid",
        `/match/${createdMatchId}`,
        `/match/${createdMatchId}/notificar`,
      ],
    };
  },
});

export async function createMatchAction(formData: FormData) {
  await createMatch(formData);
}

const updateMatch = defineAction({
  fallbackRedirect: "/grid",
  authz: requireEditor,
  parse: parseUpdateMatch,
  async run(ctx, input, meta) {
    const matchId = input.matchId;

    const unqualified = await findUnqualifiedAssignment(input.staffSelections);

    if (unqualified) {
      return {
        error: unqualifiedAssignmentNotice(
          unqualified.roleName,
          unqualified.functionKey,
        ),
      };
    }

    const kickoffAt = buildKickoffAt({
      date: input.date,
      time: input.time,
      timezone: input.timezone,
    });
    const payload: MatchUpdate = {
      competition: input.competition,
      production_mode: input.productionMode,
      status: input.status,
      home_team: input.homeTeam,
      away_team: input.awayTeam,
      venue: input.venue,
      kickoff_at: kickoffAt,
      duration_minutes: input.durationMinutes,
      timezone: input.timezone,
      owner_id: input.ownerId,
      notes: input.notes,
    };

    if (input.hasProductionCode) {
      const productionCode = input.productionCode;

      if (
        productionCode &&
        (await productionCodeExists(productionCode, matchId))
      ) {
        return { error: duplicateProductionCodeMessage(productionCode) };
      }

      payload.production_code = productionCode;
    }

    if (input.hasCommentaryPlan) {
      payload.commentary_plan = input.commentaryPlan;
    }

    if (input.hasTransport) {
      payload.transport = input.transport;
    }

    try {
      await db
        .update(matchesTable)
        .set(toMatchColumns(stampUpdate(ctx, payload)))
        .where(eq(matchesTable.id, matchId));
    } catch (error) {
      if (isUniqueViolation(error) && payload.production_code) {
        return { error: duplicateProductionCodeMessage(payload.production_code) };
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

    const roleIdsByName = await loadStaffRoleIdsByName();
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
      staffSelections: input.staffSelections,
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

    return {
      notice: "Partido actualizado.",
      notify,
      redirectTo: notify.length ? `/match/${matchId}` : meta.redirectTo,
      revalidate: ["/grid", `/match/${matchId}`],
    };
  },
});

export async function updateMatchAction(formData: FormData) {
  await updateMatch(formData);
}

const quickUpdateMatchField = defineAction({
  fallbackRedirect: "/grid",
  authz: requireEditor,
  parse: parseQuickUpdateMatchField,
  async run(ctx, { matchId, field, rawValue }) {
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

    return {
      notice: "Partido actualizado.",
      revalidate: ["/grid", `/match/${matchId}`],
    };
  },
});

export async function quickUpdateMatchFieldAction(formData: FormData) {
  await quickUpdateMatchField(formData);
}

const deleteMatch = defineAction({
  fallbackRedirect: "/grid",
  authz: requireEditor,
  parse: parseDeleteMatch,
  revalidate: ["/grid"],
  async run(ctx, { matchId }) {
    await db.delete(matchesTable).where(eq(matchesTable.id, matchId));

    await writeAudit(ctx, {
      table: "matches",
      recordId: matchId,
      action: "DELETE",
      before: { id: matchId },
      after: null,
    });

    return { notice: "Partido eliminado." };
  },
});

export async function deleteMatchAction(formData: FormData) {
  await deleteMatch(formData);
}

// Attendance confirmation by the assigned person themselves (PRD #7). Auth-only
// (NOT requireEditor): a collaborator must pass. Ownership + match-window are
// enforced inside recordAttendanceConfirmation; this wrapper only surfaces the
// outcome as a notice. Lives in /mi-jornada, never the editor match view.
const setAttendanceConfirmation = defineAction({
  fallbackRedirect: "/mi-jornada",
  authz: requireUserContext,
  parse: parseSetAttendanceConfirmation,
  async run(ctx, { assignmentId, response, note, encoder }, meta) {
    const outcome = await recordAttendanceConfirmation(ctx, {
      assignmentId,
      response,
      note,
      ...(encoder
        ? {
            encoderNumber1: encoder.encoderNumber1,
            encoderNumber2: encoder.encoderNumber2,
          }
        : {}),
    });

    if (!outcome.ok) {
      return { error: "No pudimos actualizar tu confirmación de asistencia." };
    }

    return {
      notice:
        response === "attending"
          ? "Confirmaste tu asistencia."
          : response === "declined"
            ? "Avisaste que no asistirás."
            : "Marcaste tu asistencia como pendiente.",
      revalidate: [meta.redirectTo],
    };
  },
});

export async function setAttendanceConfirmationAction(formData: FormData) {
  await setAttendanceConfirmation(formData);
}

// Encoder number(s) reported from /mi-jornada after the match was already
// accepted. Auth-only like the attendance action: ownership, the match window and
// the role gate all live in recordEncoderNumbers.
const setEncoderNumbers = defineAction({
  fallbackRedirect: "/mi-jornada",
  authz: requireUserContext,
  parse: parseSetEncoderNumbers,
  async run(ctx, input, meta) {
    const outcome = await recordEncoderNumbers(ctx, input);

    if (!outcome.ok) {
      return { error: "No pudimos guardar el número de encoder." };
    }

    return {
      notice: "Número de encoder guardado.",
      revalidate: [meta.redirectTo],
    };
  },
});

export async function setEncoderNumbersAction(formData: FormData) {
  await setEncoderNumbers(formData);
}

const upsertAssignment = defineAction({
  fallbackRedirect: "/grid",
  authz: requireEditor,
  parse: parseUpsertAssignment,
  async run(ctx, input, meta) {
    const assignmentMatchId = input.matchId;
    const assignmentRoleId = input.roleId;
    const incomingPersonId = input.personId;

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
        return {
          error: unqualifiedAssignmentNotice(
            unqualified.roleName,
            unqualified.functionKey,
          ),
        };
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
        confirmed: input.confirmed,
        notes: input.notes,
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

    return {
      notice: "Asignación actualizada.",
      notify,
      redirectTo: notify.length
        ? `/match/${assignmentMatchId}`
        : meta.redirectTo,
      revalidate: [meta.redirectTo],
    };
  },
});

export async function upsertAssignmentAction(formData: FormData) {
  await upsertAssignment(formData);
}
