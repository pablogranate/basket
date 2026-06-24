"use server";

import { revalidatePath } from "next/cache";

import {
  getRedirectTarget,
  redirectWithNotice,
  rethrowNavigationError,
} from "@/app/actions/helpers";
import type { Database } from "@/lib/database.types";
import {
  MATCH_STATUS_OPTIONS,
  normalizeCommentaryPlan,
  normalizeProductionMode,
} from "@/lib/constants";
import { buildKickoffAt, formatMatchDate } from "@/lib/date";
import { type PersonFunctionKey, roleNameToFunctionKey } from "@/lib/functions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireEditor, requireUserContext } from "@/lib/auth";
import { stampInsert, stampUpdate, writeAudit } from "@/lib/audit";
import { recordAttendanceConfirmation } from "@/lib/data/attendance";
import { shouldResetAttendance } from "@/lib/attendance";
import { ensureErrorMessage, maybeNull, pickFirstString } from "@/lib/utils";

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

const OPTIONAL_MATCH_COLUMNS = new Set([
  "external_match_id",
  "production_code",
  "commentary_plan",
  "transport",
]);

type MatchInsert = Database["public"]["Tables"]["matches"]["Insert"];
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
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
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
  const { data, error } = await supabase
    .from("person_functions")
    .select("person_id, function_key")
    .in("person_id", personIds);

  if (error) {
    throw error;
  }

  const held = new Set((data ?? []).map((row) => `${row.person_id}:${row.function_key}`));

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

// Postgres unique_violation; surfaced by supabase-js on the error `code`.
function isUniqueViolation(error: unknown): boolean {
  return Boolean(error) && (error as { code?: string }).code === "23505";
}

function duplicateExternalIdMessage(externalId: string) {
  return `El ID "${externalId}" ya existe en la base de datos. Probá con otro.`;
}

async function externalMatchIdExists(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  externalId: string,
  excludeMatchId?: string,
) {
  let query = supabase.from("matches").select("id").eq("external_match_id", externalId);

  if (excludeMatchId) {
    query = query.neq("id", excludeMatchId);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

function getMissingOptionalMatchColumn(error: unknown) {
  const message = ensureErrorMessage(error);
  const columnMatch = message.match(/Could not find the '([^']+)' column of 'matches'/i);
  const columnName = columnMatch?.[1] ?? null;

  if (!columnName || !OPTIONAL_MATCH_COLUMNS.has(columnName)) {
    return null;
  }

  return columnName;
}

async function insertMatchWithOptionalColumnFallback(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  payload: MatchInsert,
) {
  // stampInsert applied by caller (createMatchAction) before this helper runs.
  const currentPayload = { ...payload };

  while (true) {
    const result = await supabase
      .from("matches")
      .insert(currentPayload)
      .select("id")
      .single();

    if (!result.error) {
      return result;
    }

    const missingColumn = getMissingOptionalMatchColumn(result.error);

    if (!missingColumn || !(missingColumn in currentPayload)) {
      return result;
    }

    delete currentPayload[missingColumn as keyof MatchInsert];
  }
}

async function updateMatchWithOptionalColumnFallback(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  matchId: string,
  payload: MatchUpdate,
) {
  // stampUpdate applied by caller (updateMatchAction) before this helper runs.
  const currentPayload = { ...payload };

  while (true) {
    const result = await supabase
      .from("matches")
      .update(currentPayload)
      .eq("id", matchId);

    if (!result.error) {
      return result;
    }

    const missingColumn = getMissingOptionalMatchColumn(result.error);

    if (!missingColumn || !(missingColumn in currentPayload)) {
      return result;
    }

    delete currentPayload[missingColumn as keyof MatchUpdate];
  }
}

export async function createMatchAction(formData: FormData) {
  const redirectTo = getRedirectTarget(formData, "/grid");
  const createdMatchGridRedirect = getGridRedirectForCreatedMatch(formData, redirectTo);
  const ctx = await requireEditor();

  try {
    const supabase = await createSupabaseServerClient();
    const kickoffAt = buildKickoffAt({
      date: String(formData.get("date") ?? ""),
      time: String(formData.get("time") ?? ""),
      timezone: String(formData.get("timezone") ?? ""),
    });

    const externalMatchId = maybeNull(String(formData.get("externalMatchId") ?? ""));

    if (externalMatchId && (await externalMatchIdExists(supabase, externalMatchId))) {
      redirectWithNotice({
        redirectTo,
        intent: "error",
        notice: duplicateExternalIdMessage(externalMatchId),
      });
    }

    const unqualified = await findUnqualifiedAssignment(
      supabase,
      collectStaffAssignmentChecks(formData),
    );

    if (unqualified) {
      redirectWithNotice({
        redirectTo,
        intent: "error",
        notice: unqualifiedAssignmentNotice(unqualified.roleName, unqualified.functionKey),
      });
    }

    const result = await insertMatchWithOptionalColumnFallback(supabase, stampInsert(ctx, {
      competition: maybeNull(String(formData.get("competition") ?? "")),
      external_match_id: externalMatchId,
      production_code: maybeNull(String(formData.get("productionCode") ?? "")),
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
    }));

    if (result.error) {
      if (isUniqueViolation(result.error) && externalMatchId) {
        redirectWithNotice({
          redirectTo,
          intent: "error",
          notice: duplicateExternalIdMessage(externalMatchId),
        });
      }
      throw result.error;
    }

    await writeAudit(supabase, ctx, {
      table: "matches",
      recordId: result.data.id,
      action: "INSERT",
      before: null,
      after: { id: result.data.id },
    });

    const roleNames = STAFF_ROLE_FIELD_MAP.map((item) => item.roleName);
    const rolesResult = await supabase
      .from("roles")
      .select("id, name")
      .in("name", roleNames);

    if (rolesResult.error) {
      throw rolesResult.error;
    }

    const roleIdsByName = new Map(
      (rolesResult.data ?? []).map((role) => [role.name, role.id]),
    );

    const assignments = buildStaffAssignments({
      matchId: result.data.id,
      formData,
      roleIdsByName,
    });

    const notify: string[] = [];

    if (assignments.length) {
      const assignmentsResult = await supabase
        .from("assignments")
        .upsert(
          assignments.map((assignment) => stampInsert(ctx, assignment)),
          { onConflict: "match_id,role_id" },
        )
        .select("id, person_id");

      if (assignmentsResult.error) {
        throw assignmentsResult.error;
      }

      for (const row of assignmentsResult.data ?? []) {
        if (row.person_id) {
          notify.push(row.id);
        }
      }

      await writeAudit(supabase, ctx, {
        table: "assignments",
        recordId: result.data.id,
        matchId: result.data.id,
        action: "INSERT",
        before: null,
        after: { match_id: result.data.id, count: assignments.length },
      });
    }

    revalidatePath("/grid");
    revalidatePath(`/match/${result.data.id}`);
    revalidatePath(`/match/${result.data.id}/notificar`);
    redirectWithNotice({
      redirectTo: notify.length
        ? `/match/${result.data.id}`
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
    const supabase = await createSupabaseServerClient();

    const unqualified = await findUnqualifiedAssignment(
      supabase,
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

    if (formData.has("externalMatchId")) {
      const externalMatchId = maybeNull(String(formData.get("externalMatchId") ?? ""));

      if (
        externalMatchId &&
        (await externalMatchIdExists(supabase, externalMatchId, matchId))
      ) {
        redirectWithNotice({
          redirectTo,
          intent: "error",
          notice: duplicateExternalIdMessage(externalMatchId),
        });
      }

      payload.external_match_id = externalMatchId;
    }

    if (formData.has("productionCode")) {
      payload.production_code = maybeNull(String(formData.get("productionCode") ?? ""));
    }

    if (formData.has("commentaryPlan")) {
      payload.commentary_plan = maybeNull(String(formData.get("commentaryPlan") ?? ""));
    }

    if (formData.has("transport")) {
      payload.transport = maybeNull(String(formData.get("transport") ?? ""));
    }

    const result = await updateMatchWithOptionalColumnFallback(
      supabase,
      matchId,
      stampUpdate(ctx, payload),
    );

    if (result.error) {
      if (isUniqueViolation(result.error) && payload.external_match_id) {
        redirectWithNotice({
          redirectTo,
          intent: "error",
          notice: duplicateExternalIdMessage(payload.external_match_id),
        });
      }
      throw result.error;
    }

    await writeAudit(supabase, ctx, {
      table: "matches",
      recordId: matchId,
      action: "UPDATE",
      before: null,
      after: { id: matchId, ...payload },
    });

    const roleNames = STAFF_ROLE_FIELD_MAP.map((item) => item.roleName);
    const rolesResult = await supabase
      .from("roles")
      .select("id, name")
      .in("name", roleNames);

    if (rolesResult.error) {
      throw rolesResult.error;
    }

    const roleIdsByName = new Map(
      (rolesResult.data ?? []).map((role) => [role.name, role.id]),
    );
    const roleIds = [...roleIdsByName.values()];
    const priorAssignmentKeys = new Set<string>();

    if (roleIds.length) {
      const priorResult = await supabase
        .from("assignments")
        .select("role_id, person_id")
        .eq("match_id", matchId)
        .in("role_id", roleIds);

      for (const row of priorResult.data ?? []) {
        if (row.person_id) {
          priorAssignmentKeys.add(`${row.role_id}:${row.person_id}`);
        }
      }

      const deleteAssignmentsResult = await supabase
        .from("assignments")
        .delete()
        .eq("match_id", matchId)
        .in("role_id", roleIds);

      if (deleteAssignmentsResult.error) {
        throw deleteAssignmentsResult.error;
      }
    }

    const assignments = buildStaffAssignments({
      matchId,
      formData,
      roleIdsByName,
    });

    const notify: string[] = [];

    if (assignments.length) {
      const assignmentsResult = await supabase
        .from("assignments")
        .upsert(
          assignments.map((assignment) => stampInsert(ctx, assignment)),
          { onConflict: "match_id,role_id" },
        )
        .select("id, role_id, person_id");

      if (assignmentsResult.error) {
        throw assignmentsResult.error;
      }

      for (const row of assignmentsResult.data ?? []) {
        if (row.person_id && !priorAssignmentKeys.has(`${row.role_id}:${row.person_id}`)) {
          notify.push(row.id);
        }
      }

      await writeAudit(supabase, ctx, {
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
    const supabase = await createSupabaseServerClient();
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

        const matchQuery = await supabase
          .from("matches")
          .select("kickoff_at, timezone")
          .eq("id", matchId)
          .single();

        if (matchQuery.error) {
          throw matchQuery.error;
        }

        payload.kickoff_at = buildKickoffAt({
          date: formatMatchDate(
            matchQuery.data.kickoff_at,
            matchQuery.data.timezone,
            "yyyy-MM-dd",
          ),
          time: rawValue,
          timezone: matchQuery.data.timezone,
        });
        break;
      }
      default:
        throw new Error("Campo de edición rápida no soportado.");
    }

    const result = await supabase
      .from("matches")
      .update(stampUpdate(ctx, payload))
      .eq("id", matchId);

    if (result.error) {
      throw result.error;
    }

    await writeAudit(supabase, ctx, {
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
    const supabase = await createSupabaseServerClient();
    const result = await supabase.from("matches").delete().eq("id", matchId);

    if (result.error) {
      throw result.error;
    }

    await writeAudit(supabase, ctx, {
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
    const confirmed = String(formData.get("confirmed") ?? "") === "on";

    const outcome = await recordAttendanceConfirmation(ctx, {
      assignmentId,
      confirmed,
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
      notice: confirmed
        ? "Confirmaste tu asistencia."
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
    const supabase = await createSupabaseServerClient();
    const assignmentMatchId = String(formData.get("matchId") ?? "");
    const assignmentRoleId = String(formData.get("roleId") ?? "");
    const incomingPersonId = maybeNull(String(formData.get("personId") ?? ""));

    if (incomingPersonId) {
      const roleResult = await supabase
        .from("roles")
        .select("name")
        .eq("id", assignmentRoleId)
        .maybeSingle();

      if (roleResult.error) {
        throw roleResult.error;
      }

      const roleName = roleResult.data?.name;
      const unqualified = roleName
        ? await findUnqualifiedAssignment(supabase, [
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

    const priorResult = await supabase
      .from("assignments")
      .select("person_id")
      .eq("match_id", assignmentMatchId)
      .eq("role_id", assignmentRoleId)
      .maybeSingle();
    const priorPersonId = priorResult.data?.person_id ?? null;

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

    const result = await supabase
      .from("assignments")
      .upsert(stampInsert(ctx, assignmentPayload), {
        onConflict: "match_id,role_id",
      })
      .select("id, match_id")
      .single();

    if (result.error) {
      throw result.error;
    }

    await writeAudit(supabase, ctx, {
      table: "assignments",
      recordId: result.data.id,
      matchId: result.data.match_id,
      action: "INSERT",
      before: null,
      after: { id: result.data.id, match_id: result.data.match_id },
    });

    const notify =
      incomingPersonId && incomingPersonId !== priorPersonId
        ? [result.data.id]
        : [];

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
