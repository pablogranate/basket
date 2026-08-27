import "server-only";

import { eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  assignments as assignmentsTable,
  matches as matchesTable,
  people as peopleTable,
} from "@/lib/db/schema";
import type { PersonRef, SyncPlan } from "@/lib/grid/sync-plan";

export type ApplyGridSyncResult = {
  created: number;
  updated: number;
  deleted: number;
  assignmentsUpserted: number;
  assignmentsDeleted: number;
  peopleCreated: number;
  errors: string[];
};

// Postgres unique_violation; surfaced by the postgres driver on the error `code`.
function isUniqueViolation(error: unknown): boolean {
  return Boolean(error) && (error as { code?: string }).code === "23505";
}

// postgres driver errors are plain objects, not Error instances in every case;
// String() on them can yield "[object Object]", so read `.message` explicitly.
function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : String(error);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function applyGridSync(plan: SyncPlan, now: Date): Promise<ApplyGridSyncResult> {
  const result: ApplyGridSyncResult = {
    created: 0,
    updated: 0,
    deleted: 0,
    assignmentsUpserted: 0,
    assignmentsDeleted: 0,
    peopleCreated: 0,
    errors: [],
  };

  const nowIso = now.toISOString();

  // 1. People first: create the plan's keyed people, resurrect the soft-deleted
  // ones. A failure poisons the person's ref so every entry that references it
  // fails with the same message, mirroring today's per-entry tolerance.
  const personIdByKey = new Map<string, string>();
  const failedPersonKeys = new Map<string, string>();
  const failedPersonIds = new Map<string, string>();

  for (const { key, name } of plan.peopleToCreate) {
    try {
      const created = await db
        .insert(peopleTable)
        .values({ fullName: name, active: true })
        .returning({ id: peopleTable.id });
      personIdByKey.set(key, created[0].id);
      result.peopleCreated += 1;
    } catch (error) {
      failedPersonKeys.set(key, toErrorMessage(error));
    }
  }

  for (const { id, name } of plan.peopleToResurrect) {
    try {
      await db
        .update(peopleTable)
        .set({ deletedAt: null, updatedAt: nowIso })
        .where(eq(peopleTable.id, id));
      console.info(
        `[grid-sync] resurrected "${name}" (asignado en la grilla pero fuera de la pestaña de contactos)`,
      );
    } catch (error) {
      failedPersonIds.set(id, toErrorMessage(error));
    }
  }

  const resolvePersonRef = (ref: PersonRef): string => {
    if (ref.kind === "id") {
      const failure = failedPersonIds.get(ref.id);
      if (failure) {
        throw new Error(failure);
      }
      return ref.id;
    }
    const failure = failedPersonKeys.get(ref.key);
    if (failure) {
      throw new Error(failure);
    }
    const id = personIdByKey.get(ref.key);
    if (!id) {
      throw new Error(`No se pudo crear la persona planificada ("${ref.key}").`);
    }
    return id;
  };

  const upsertAssignment = async (matchId: string, roleId: string, personId: string) => {
    // App owns updated_at on the conflict-update path (trigger dropped).
    await db
      .insert(assignmentsTable)
      .values({
        matchId,
        roleId,
        personId,
        confirmed: false,
        notes: null,
      })
      .onConflictDoUpdate({
        target: [assignmentsTable.matchId, assignmentsTable.roleId],
        set: {
          personId,
          confirmed: false,
          notes: null,
          updatedAt: nowIso,
        },
      });
    result.assignmentsUpserted += 1;
  };

  // 2. Per-entry writes: error-tolerant, one failed entry never stops the rest.
  for (const item of plan.creates) {
    try {
      const ownerId = item.owner ? resolvePersonRef(item.owner) : null;

      let insertedId: string;
      try {
        const insert = await db
          .insert(matchesTable)
          .values({ ...item.values, ownerId })
          .returning({ id: matchesTable.id });
        insertedId = insert[0].id;
      } catch (insertError) {
        // DB unique-index backstop (race or pre-existing duplicate).
        if (isUniqueViolation(insertError) && item.values.productionCode) {
          throw new Error(
            `El ID "${item.values.productionCode}" ya existe en la base de datos. Probá con otro.`,
          );
        }
        throw insertError;
      }

      result.created += 1;

      for (const assignment of item.assignments) {
        const personId = resolvePersonRef(assignment.person);
        await upsertAssignment(insertedId, assignment.roleId, personId);
      }
    } catch (error) {
      result.errors.push(`${item.label}: ${toErrorMessage(error)}`);
    }
  }

  for (const item of plan.updates) {
    try {
      const patch: Partial<typeof matchesTable.$inferInsert> = { ...item.patch };
      if (item.owner !== undefined) {
        patch.ownerId = item.owner ? resolvePersonRef(item.owner) : null;
      }

      if (Object.keys(patch).length) {
        // App now owns updated_at (the set_row_metadata trigger is gone in the
        // self-hosted DB); this sync has no actor, so *_by stays NULL.
        patch.updatedAt = nowIso;
        await db.update(matchesTable).set(patch).where(eq(matchesTable.id, item.id));
        result.updated += 1;
      }

      for (const assignment of item.assignmentUpserts) {
        const personId = resolvePersonRef(assignment.person);
        await upsertAssignment(item.id, assignment.roleId, personId);
      }

      for (const assignmentId of item.assignmentDeletes) {
        await db.delete(assignmentsTable).where(eq(assignmentsTable.id, assignmentId));
        result.assignmentsDeleted += 1;
      }
    } catch (error) {
      result.errors.push(`${item.label}: ${toErrorMessage(error)}`);
    }
  }

  // 3. Delete pass. Skipped when the plan already gated it, and additionally
  // when ANY apply-time entry write failed: a partial failure must not make
  // still-present matches look "removed".
  if (plan.deletePassSkipped || result.errors.length > 0) {
    return result;
  }

  const deletedLabels: string[] = [];
  for (const rowChunk of chunk(plan.deletes, 300)) {
    try {
      await db.delete(matchesTable).where(
        inArray(
          matchesTable.id,
          rowChunk.map((match) => match.id),
        ),
      );
    } catch (removeError) {
      // Error-tolerant: a delete failure must not abort a run that already
      // created/updated successfully.
      result.errors.push(toErrorMessage(removeError));
      continue;
    }
    result.deleted += rowChunk.length;
    for (const match of rowChunk) {
      deletedLabels.push(match.label);
    }
  }

  // Only forensic trail: the match's audit_log rows cascade away with it,
  // so the delete leaves no audit record.
  if (deletedLabels.length) {
    console.info("[grid-sync] deleted:", deletedLabels);
  }

  return result;
}
