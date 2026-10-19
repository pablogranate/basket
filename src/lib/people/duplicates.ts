import "server-only";

import { and, count, eq, inArray } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import {
  assignments as assignmentsTable,
  peopleMergeDismissals as peopleMergeDismissalsTable,
} from "@/lib/db/schema";
import { listApprovalCandidates } from "@/lib/people/identity";
import {
  findDuplicateFichas,
  orderFichaPair,
  type MergeFicha,
} from "@/lib/people/merge";

// The "Posibles fichas duplicadas" review: fichas with a Cuenta next to the
// Cuenta-less fichas that look like the same person, and the pairs an admin
// marked as two different people, which leave the review until restored.

type Actor = { profileId: string | null };

export type DuplicateFicha = MergeFicha & { assignmentCount: number };

export type DuplicateReview = {
  pending: { survivor: DuplicateFicha; duplicates: DuplicateFicha[] }[];
  dismissed: { person: MergeFicha; other: MergeFicha }[];
};

export async function getDuplicateReview(exec: DbExecutor): Promise<DuplicateReview> {
  const [candidates, dismissals] = await Promise.all([
    listApprovalCandidates(exec),
    exec
      .select({
        personId: peopleMergeDismissalsTable.personId,
        otherPersonId: peopleMergeDismissalsTable.otherPersonId,
      })
      .from(peopleMergeDismissalsTable)
      .orderBy(peopleMergeDismissalsTable.createdAt),
  ]);
  const fichaById = new Map<string, MergeFicha>(
    candidates.map(({ id, fullName, email, profileId }) => [
      id,
      { id, fullName, email, profileId: profileId ?? null },
    ]),
  );
  const groups = findDuplicateFichas(
    [...fichaById.values()],
    dismissals.map((row): [string, string] => [row.personId, row.otherPersonId]),
  );
  const countById = await countAssignments(
    exec,
    groups.flatMap((group) => [group.survivor, ...group.duplicates].map((ficha) => ficha.id)),
  );
  const withCount = (ficha: MergeFicha): DuplicateFicha => ({
    ...ficha,
    assignmentCount: countById.get(ficha.id) ?? 0,
  });

  return {
    pending: groups.map((group) => ({
      survivor: withCount(group.survivor),
      duplicates: group.duplicates.map(withCount),
    })),
    dismissed: dismissals.flatMap((row) => {
      const person = fichaById.get(row.personId);
      const other = fichaById.get(row.otherPersonId);

      return person && other ? [{ person, other }] : [];
    }),
  };
}

export async function dismissDuplicatePair(
  exec: DbExecutor,
  input: { personId: string; otherPersonId: string; actor: Actor },
): Promise<void> {
  if (input.personId === input.otherPersonId) {
    throw new Error("Elegí dos fichas distintas.");
  }

  const [personId, otherPersonId] = orderFichaPair(input.personId, input.otherPersonId);

  await exec
    .insert(peopleMergeDismissalsTable)
    .values({ personId, otherPersonId, createdBy: input.actor.profileId })
    .onConflictDoNothing();
}

export async function restoreDuplicatePair(
  exec: DbExecutor,
  input: { personId: string; otherPersonId: string },
): Promise<void> {
  const [personId, otherPersonId] = orderFichaPair(input.personId, input.otherPersonId);

  await exec
    .delete(peopleMergeDismissalsTable)
    .where(
      and(
        eq(peopleMergeDismissalsTable.personId, personId),
        eq(peopleMergeDismissalsTable.otherPersonId, otherPersonId),
      ),
    );
}

async function countAssignments(exec: DbExecutor, personIds: string[]) {
  if (!personIds.length) {
    return new Map<string, number>();
  }

  const rows = await exec
    .select({ personId: assignmentsTable.personId, value: count() })
    .from(assignmentsTable)
    .where(inArray(assignmentsTable.personId, personIds))
    .groupBy(assignmentsTable.personId);

  return new Map(rows.map((row) => [row.personId ?? "", row.value]));
}
