"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { STAFF_ROLE_FIELD_MAP, type StaffRoleName } from "@/lib/actions/parse/matches";
import { requireEditor, type UserContext } from "@/lib/auth";
import {
  DEFAULT_MATCH_DURATION_MINUTES,
  DEFAULT_TIMEZONE,
  normalizeProductionMode,
} from "@/lib/constants";
import { getTeamPickerCatalog } from "@/lib/data/teams";
import { db } from "@/lib/db/client";
import { assignments as assignmentsTable, people as peopleTable } from "@/lib/db/schema";
import { isDomainError, userErrorMessage } from "@/lib/errors";
import type {
  PlanillaCreateResult,
  PlanillaDeleteResult,
  PlanillaSaveResult,
} from "@/lib/grid/planilla-sync";
import { listLeagues } from "@/lib/leagues/leagues";
import { reportError } from "@/lib/log";
import {
  createMatchRecord,
  deleteMatchRecord,
  loadStaffRoleIdsByName,
  updateMatchField,
  upsertMatchAssignment,
} from "@/lib/matches/match-writes";
import { normalizeText } from "@/lib/utils";

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
  if (!isDomainError(error)) {
    reportError(error, route);
  }
  return { ok: false, error: userErrorMessage(error) };
}

// The sheet's dropdowns already hold only cataloged teams, leagues and people;
// the server checks again so nothing untyped reaches the database whatever the
// browser sends. Names come back in their catalog spelling.
type PlanillaCatalog = {
  team(name: string): string | null;
  league(name: string): string | null;
};

async function loadPlanillaCatalog(ctx: UserContext): Promise<PlanillaCatalog> {
  const [teamCatalog, leagues] = await Promise.all([getTeamPickerCatalog(ctx), listLeagues()]);
  if (!teamCatalog.teams.length) {
    throw new Error("[grid-planilla] team catalog came back empty");
  }
  const byKey = (names: string[]) => new Map(names.map((name) => [normalizeText(name), name]));
  const teams = byKey(teamCatalog.teams.map((team) => team.name));
  const leagueNames = byKey(leagues.map((league) => league.name));
  return {
    team: (name) => teams.get(normalizeText(name)) ?? null,
    league: (name) => leagueNames.get(normalizeText(name)) ?? null,
  };
}

async function loadActivePersonIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) {
    return new Set();
  }
  const rows = await db
    .select({ id: peopleTable.id })
    .from(peopleTable)
    .where(
      and(
        inArray(peopleTable.id, [...new Set(ids)]),
        eq(peopleTable.active, true),
        isNull(peopleTable.deletedAt),
        isNull(peopleTable.mergedIntoId),
      ),
    );
  return new Set(rows.map((row) => row.id));
}

const UNKNOWN_PERSON = "Esa persona no está en Personas.";

function unknownTeam(name: string) {
  return `El equipo «${name}» no está en Equipos.`;
}

function unknownLeague(name: string) {
  return `La liga «${name}» no está en Ligas.`;
}

const CATALOG_FIELDS = new Set(["homeTeam", "awayTeam", "competition"]);
// For a batch with no team or league edit: nothing asks it.
const NO_CATALOG: PlanillaCatalog = { team: () => null, league: () => null };

// The catalog value for a typed field, or the reason it is refused.
function checkField(
  catalog: PlanillaCatalog,
  field: string,
  value: string,
): { value: string } | { error: string } {
  if (field === "homeTeam" || field === "awayTeam") {
    const team = catalog.team(value);
    return team ? { value: team } : { error: unknownTeam(value) };
  }
  if (field === "competition" && value) {
    const league = catalog.league(value);
    return league ? { value: league } : { error: unknownLeague(value) };
  }
  return { value };
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

  let roleIdsByName: Map<string, string>;
  let catalog: PlanillaCatalog;
  let activePeople: Set<string>;
  try {
    [roleIdsByName, catalog, activePeople] = await Promise.all([
      loadStaffRoleIdsByName(),
      parsed.data.some((edit) => edit.kind === "field" && CATALOG_FIELDS.has(edit.field))
        ? loadPlanillaCatalog(ctx)
        : NO_CATALOG,
      loadActivePersonIds(
        parsed.data.flatMap((edit) => (edit.kind === "role" && edit.personId ? [edit.personId] : [])),
      ),
    ]);
  } catch (error) {
    const failed = failure(error, "savePlanillaEditsAction");
    return parsed.data.map(() => failed);
  }
  const results: PlanillaSaveResult[] = [];

  for (const edit of parsed.data) {
    try {
      if (edit.kind === "role") {
        if (edit.personId && !activePeople.has(edit.personId)) {
          results.push({ ok: false, error: UNKNOWN_PERSON });
          continue;
        }
        results.push(await saveRoleEdit(ctx, edit, roleIdsByName));
        continue;
      }
      const checked = checkField(catalog, edit.field, edit.value.trim());
      if ("error" in checked) {
        results.push({ ok: false, error: checked.error });
        continue;
      }
      const result = await updateMatchField(ctx, {
        matchId: edit.matchId,
        field: edit.field,
        rawValue: checked.value,
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
    const [catalog, activePeople] = await Promise.all([
      loadPlanillaCatalog(ctx),
      loadActivePersonIds(input.staff.map((item) => item.personId)),
    ]);
    const homeTeam = catalog.team(input.homeTeam);
    const awayTeam = catalog.team(input.awayTeam);
    const competition = input.competition ? catalog.league(input.competition) : null;
    if (!homeTeam) {
      return { ok: false, error: unknownTeam(input.homeTeam) };
    }
    if (!awayTeam) {
      return { ok: false, error: unknownTeam(input.awayTeam) };
    }
    if (input.competition && !competition) {
      return { ok: false, error: unknownLeague(input.competition) };
    }
    if (input.staff.some((item) => !activePeople.has(item.personId))) {
      return { ok: false, error: UNKNOWN_PERSON };
    }

    const created = await createMatchRecord(ctx, {
      date: input.date,
      time: input.time,
      timezone: input.timezone ?? DEFAULT_TIMEZONE,
      competition,
      productionMode: normalizeProductionMode(input.productionMode),
      status: "Pendiente",
      homeTeam,
      awayTeam,
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

// Each Partido is deleted on its own: one that can't go (it has incidencias)
// doesn't stop the rest.
export async function deletePlanillaMatchesAction(
  rawIds: unknown,
): Promise<PlanillaDeleteResult> {
  const ctx = await requireEditor();
  const parsed = deleteIdsSchema.safeParse(rawIds);

  if (!parsed.success) {
    return { deleted: [], failed: [], error: "Partidos inválidos." };
  }

  const deleted: string[] = [];
  const failed: { matchId: string; error: string }[] = [];
  for (const matchId of new Set(parsed.data)) {
    try {
      await deleteMatchRecord(ctx, matchId);
      deleted.push(matchId);
    } catch (error) {
      failed.push({ matchId, error: failure(error, "deletePlanillaMatchesAction").error });
    }
  }

  if (deleted.length) {
    revalidatePath("/grid");
  }

  return { deleted, failed };
}
