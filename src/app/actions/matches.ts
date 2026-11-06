"use server";

import { addFields } from "basket-tv-telemetry/log";
import { and, eq, inArray, sql } from "drizzle-orm";

import { defineAction } from "@/lib/actions/define-action";
import {
  getGridRedirectForCreatedMatch,
  parseCreateMatch,
  parseDeleteMatch,
  parseQuickUpdateMatchField,
  parseSetAttendanceConfirmation,
  parseSetEncoderNumbers,
  parseUpdateMatch,
  parseUpsertAssignment,
} from "@/lib/actions/parse/matches";
import type { Database } from "@/lib/database.types";
import { buildKickoffAt } from "@/lib/date";
import { db } from "@/lib/db/client";
import {
  assignments as assignmentsTable,
  matches as matchesTable,
} from "@/lib/db/schema";
import { requireEditor, requireUserContext } from "@/lib/auth";
import { stampInsert, stampUpdate, writeAudit } from "@/lib/audit";
import {
  recordAttendanceConfirmation,
  recordEncoderNumbers,
} from "@/lib/data/attendance";
import { isUniqueViolation } from "@/lib/db/errors";
import {
  buildStaffAssignments,
  createMatchRecord,
  duplicateProductionCodeMessage,
  findUnqualifiedAssignment,
  loadStaffRoleIdsByName,
  productionCodeExists,
  toAssignmentColumns,
  toMatchColumns,
  unqualifiedAssignmentNotice,
  updateMatchField,
  upsertMatchAssignment,
} from "@/lib/matches/match-writes";
import { telemetry } from "@/lib/telemetry";

type MatchUpdate = Database["public"]["Tables"]["matches"]["Update"];

const createMatch = defineAction({
  name: "createMatchAction",
  fallbackRedirect: "/grid",
  authz: requireEditor,
  parse: parseCreateMatch,
  async run(ctx, input, meta) {
    const created = await createMatchRecord(ctx, input);

    if ("error" in created) {
      return created;
    }

    const { matchId: createdMatchId, assignmentCount, notify } = created;

    telemetry.trackServerEvent("match_created", ctx.userId, {
      match_id: createdMatchId,
      has_assignments: assignmentCount > 0,
      staff_count: notify.length,
    });
    addFields({ match: { id: createdMatchId, staff_count: notify.length } });

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
  name: "updateMatchAction",
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

    addFields({ match: { id: matchId } });

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
  name: "quickUpdateMatchFieldAction",
  fallbackRedirect: "/grid",
  authz: requireEditor,
  parse: parseQuickUpdateMatchField,
  async run(ctx, input) {
    const result = await updateMatchField(ctx, input);

    if ("error" in result) {
      return result;
    }

    addFields({ match: { id: input.matchId } });

    return {
      notice: "Partido actualizado.",
      revalidate: ["/grid", `/match/${input.matchId}`],
    };
  },
});

export async function quickUpdateMatchFieldAction(formData: FormData) {
  await quickUpdateMatchField(formData);
}

const deleteMatch = defineAction({
  name: "deleteMatchAction",
  fallbackRedirect: "/grid",
  authz: requireEditor,
  parse: parseDeleteMatch,
  revalidate: ["/grid"],
  async run(ctx, { matchId }) {
    await db.delete(matchesTable).where(eq(matchesTable.id, matchId));
    addFields({ match: { id: matchId } });

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
  name: "setAttendanceConfirmationAction",
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
  name: "setEncoderNumbersAction",
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
  name: "upsertAssignmentAction",
  fallbackRedirect: "/grid",
  authz: requireEditor,
  parse: parseUpsertAssignment,
  async run(ctx, input, meta) {
    const result = await upsertMatchAssignment(ctx, input);

    if ("error" in result) {
      return result;
    }

    addFields({ match: { id: result.matchId } });
    telemetry.trackServerEvent("staff_assigned", ctx.userId, {
      match_id: result.matchId,
      role_name: result.roleName,
      is_new: result.isNew,
    });

    return {
      notice: "Asignación actualizada.",
      notify: result.notify,
      redirectTo: result.notify.length ? `/match/${input.matchId}` : meta.redirectTo,
      revalidate: [meta.redirectTo],
    };
  },
});

export async function upsertAssignmentAction(formData: FormData) {
  await upsertAssignment(formData);
}
