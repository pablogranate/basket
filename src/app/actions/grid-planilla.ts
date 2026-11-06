"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { STAFF_ROLE_FIELD_MAP, type StaffRoleName } from "@/lib/actions/parse/matches";
import { requireEditor, type UserContext } from "@/lib/auth";
import {
  DEFAULT_MATCH_DURATION_MINUTES,
  DEFAULT_TIMEZONE,
  normalizeProductionMode,
} from "@/lib/constants";
import { db } from "@/lib/db/client";
import { assignments as assignmentsTable } from "@/lib/db/schema";
import { userErrorMessage } from "@/lib/errors";
import type {
  PlanillaCreateResult,
  PlanillaDeleteResult,
  PlanillaSaveResult,
} from "@/lib/grid/planilla-sync";
import { reportError } from "@/lib/log";
import {
  createMatchRecord,
  deleteMatchRecord,
  loadStaffRoleIdsByName,
  updateMatchField,
  upsertMatchAssignment,
} from "@/lib/matches/match-writes";

const STAFF_ROLE_NAMES = STAFF_ROLE_FIELD_MAP.map((item) => item.roleName) as [
  StaffRoleName,
  ...StaffRoleName[],
];

const editSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("field"),
    matchId: z.uuid(),
    field: z.enum([
      "kickoffDate",
      "kickoffTime",
      "homeTeam",
      "awayTeam",
      "competition",
      "productionMode",
      "productionCode",
      "commentaryPlan",
      "transport",
      "notes",
    ]),
    value: z.string().max(2000),
  }),
  z.object({
    kind: z.literal("role"),
    matchId: z.uuid(),
    roleName: z.enum(STAFF_ROLE_NAMES),
    personId: z.uuid().nullable(),
  }),
]);

const editsSchema = z.array(editSchema).max(500);

const newMatchSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().min(1).optional(),
  homeTeam: z.string().trim().min(1).max(200),
  awayTeam: z.string().trim().min(1).max(200),
  competition: z.string().max(200).nullable(),
  productionMode: z.string().max(100).nullable(),
  productionCode: z.string().max(100).nullable(),
  commentaryPlan: z.string().max(100).nullable(),
  transport: z.string().max(2000).nullable(),
  notes: z.string().max(2000).nullable(),
  staff: z
    .array(z.object({ roleName: z.enum(STAFF_ROLE_NAMES), personId: z.uuid() }))
    .max(STAFF_ROLE_NAMES.length),
});

function failure(error: unknown, route: string): { ok: false; error: string } {
  reportError(error, route);
  return { ok: false, error: userErrorMessage(error) };
}

async function saveRoleEdit(
  ctx: UserContext,
  edit: { matchId: string; roleName: StaffRoleName; personId: string | null },
  roleIdsByName: Map<string, string>,
): Promise<PlanillaSaveResult> {
  const roleId = roleIdsByName.get(edit.roleName);
  if (!roleId) {
    return { ok: false, error: `El rol «${edit.roleName}» no existe.` };
  }

  // The cell only carries the person: keep the slot's notes, and its
  // confirmation while the person stays the same.
  const current = await db
    .select({
      person_id: assignmentsTable.personId,
      confirmed: assignmentsTable.confirmed,
      notes: assignmentsTable.notes,
    })
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.matchId, edit.matchId), eq(assignmentsTable.roleId, roleId)))
    .limit(1);
  const prior = current[0];

  const result = await upsertMatchAssignment(ctx, {
    matchId: edit.matchId,
    roleId,
    personId: edit.personId,
    confirmed: prior?.person_id === edit.personId ? prior.confirmed : false,
    notes: prior?.notes ?? null,
  });

  return "error" in result ? { ok: false, error: result.error } : { ok: true };
}

export async function savePlanillaEditsAction(
  rawEdits: unknown,
): Promise<PlanillaSaveResult[]> {
  const ctx = await requireEditor();
  const parsed = editsSchema.safeParse(rawEdits);

  if (!parsed.success) {
    return [{ ok: false, error: "Cambios inválidos." }];
  }

  const roleIdsByName = await loadStaffRoleIdsByName();
  const results: PlanillaSaveResult[] = [];

  for (const edit of parsed.data) {
    try {
      if (edit.kind === "role") {
        results.push(await saveRoleEdit(ctx, edit, roleIdsByName));
        continue;
      }
      const result = await updateMatchField(ctx, {
        matchId: edit.matchId,
        field: edit.field,
        rawValue: edit.value.trim(),
      });
      results.push("error" in result ? { ok: false, error: result.error } : { ok: true });
    } catch (error) {
      results.push(failure(error, "savePlanillaEditsAction"));
    }
  }

  if (results.some((result) => result.ok)) {
    revalidatePath("/grid");
  }

  return results;
}

export async function createPlanillaMatchAction(
  rawMatch: unknown,
): Promise<PlanillaCreateResult> {
  const ctx = await requireEditor();
  const parsed = newMatchSchema.safeParse(rawMatch);

  if (!parsed.success) {
    return { ok: false, error: "La fila no tiene un partido válido." };
  }

  const input = parsed.data;
  const personByRole = new Map(input.staff.map((item) => [item.roleName, item.personId]));

  try {
    const created = await createMatchRecord(ctx, {
      date: input.date,
      time: input.time,
      timezone: input.timezone ?? DEFAULT_TIMEZONE,
      competition: input.competition,
      productionMode: normalizeProductionMode(input.productionMode),
      status: "Pendiente",
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
      venue: null,
      durationMinutes: DEFAULT_MATCH_DURATION_MINUTES,
      ownerId: personByRole.get("Responsable") ?? null,
      notes: input.notes,
      productionCode: input.productionCode,
      commentaryPlan: input.commentaryPlan,
      transport: input.transport,
      staffSelections: STAFF_ROLE_NAMES.map((roleName) => ({
        roleName,
        personId: personByRole.get(roleName) ?? null,
      })),
    });

    if ("error" in created) {
      return { ok: false, error: created.error };
    }

    revalidatePath("/grid");
    return { ok: true, matchId: created.matchId, newAssignments: created.notify.length };
  } catch (error) {
    return failure(error, "createPlanillaMatchAction");
  }
}

const deleteIdsSchema = z.array(z.uuid()).min(1).max(200);

export async function deletePlanillaMatchesAction(
  rawIds: unknown,
): Promise<PlanillaDeleteResult> {
  const ctx = await requireEditor();
  const parsed = deleteIdsSchema.safeParse(rawIds);

  if (!parsed.success) {
    return { ok: false, deleted: [], error: "Partidos inválidos." };
  }

  const deleted: string[] = [];
  try {
    for (const matchId of new Set(parsed.data)) {
      await deleteMatchRecord(ctx, matchId);
      deleted.push(matchId);
    }
  } catch (error) {
    return { ...failure(error, "deletePlanillaMatchesAction"), deleted };
  } finally {
    if (deleted.length) {
      revalidatePath("/grid");
    }
  }

  return { ok: true, deleted };
}
