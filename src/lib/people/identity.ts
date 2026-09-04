import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  resolveApprovalTarget,
  type ApprovalCandidate,
} from "@/lib/access-requests/approval";
import type { AccessTierRole } from "@/lib/access-tier";
import { stampInsert, stampUpdate } from "@/lib/audit";
import type { AppRole } from "@/lib/database.types";
import type { DbExecutor } from "@/lib/db/client";
import {
  assignments as assignmentsTable,
  matches as matchesTable,
  notificationLogs as notificationLogsTable,
  people as peopleTable,
  peopleTeams as peopleTeamsTable,
  personFunctions as personFunctionsTable,
  profiles as profilesTable,
} from "@/lib/db/schema";

// Ficha ↔ cuenta identity. A ficha is a `people` row (the person as production
// staff); a cuenta is a `profiles` row (the login). This module owns every write
// that creates, links or merges them, so the rules live once:
//
// - A cuenta is found by email, case-insensitively, and created when missing.
// - A ficha is reactivated when the approver picked one, created otherwise.
// - Fusión de fichas repoints every referrer of the duplicate onto the survivor
//   and soft-deletes it. Never a hard DELETE: the old row can own past grillas
//   (D-14).
// - Linking claims only an unlinked ficha, so it can never steal a link another
//   cuenta already owns.

type Actor = { profileId: string | null };

export type SettleApplicantInput = {
  email: string;
  fullName: string;
  phone: string;
  roleId: string | null;
  accessRole: AccessTierRole;
  personId: string | null;
  mergePersonId: string | null;
  actor: Actor;
};

export type SettledApplicant = { profileId: string; personId: string };

export async function settleApplicant(
  exec: DbExecutor,
  input: SettleApplicantInput,
): Promise<SettledApplicant> {
  const email = input.email.trim().toLowerCase();
  const profileId = await upsertProfile(exec, {
    email,
    fullName: input.fullName,
    role: input.accessRole,
  });
  const personId = await upsertPerson(exec, {
    personId: input.personId,
    profileId,
    email,
    fullName: input.fullName,
    phone: input.phone,
    roleId: input.roleId,
    actor: input.actor,
  });

  if (input.mergePersonId && input.mergePersonId !== personId) {
    await mergePersonInto(exec, {
      fromPersonId: input.mergePersonId,
      intoPersonId: personId,
      actor: input.actor,
    });
  }

  return { profileId, personId };
}

export async function linkProfileToPerson(
  exec: DbExecutor,
  input: { profileId: string; personId: string; actor: Actor },
): Promise<void> {
  const stamped = stampUpdate(input.actor, {});
  const linked = await exec
    .update(peopleTable)
    .set({
      profileId: input.profileId,
      updatedBy: stamped.updated_by,
      updatedAt: stamped.updated_at,
    })
    .where(
      and(eq(peopleTable.id, input.personId), isNull(peopleTable.profileId)),
    )
    .returning({ id: peopleTable.id });

  if (!linked[0]) {
    throw new Error("Esa ficha ya está vinculada a otra cuenta.");
  }
}

// Candidate fichas for the approve modal. Soft-deleted rows are excluded;
// inactive ones are not, because reactivating a known person beats duplicating
// them.
export type ApprovalCandidateRow = ApprovalCandidate & {
  phone: string | null;
  roleId: string | null;
};

export async function listApprovalCandidates(
  exec: DbExecutor,
): Promise<ApprovalCandidateRow[]> {
  const rows = await exec
    .select({
      id: peopleTable.id,
      fullName: peopleTable.fullName,
      email: peopleTable.email,
      profileId: peopleTable.profileId,
      phone: peopleTable.phone,
      roleId: peopleTable.roleId,
    })
    .from(peopleTable)
    .where(isNull(peopleTable.deletedAt));

  return rows as ApprovalCandidateRow[];
}

export type LinkReviewRow = {
  profile: { id: string; full_name: string | null; email: string; role: string };
  candidates: { id: string; full_name: string; email: string | null }[];
};

// The one-time review list the 0034 backfill leaves behind (D-09): cuentas with
// access that no ficha claims, paired with the unlinked fichas whose name looks
// like the same human. Profiles with no name match are left out — an admin who
// never appears in the grilla is normal, not a leftover.
export async function listProfileLinkReview(
  exec: DbExecutor,
): Promise<LinkReviewRow[]> {
  const [profiles, candidates] = await Promise.all([
    exec
      .select({
        id: profilesTable.id,
        full_name: profilesTable.fullName,
        email: profilesTable.email,
        role: profilesTable.role,
      })
      .from(profilesTable)
      .leftJoin(peopleTable, eq(peopleTable.profileId, profilesTable.id))
      .where(isNull(peopleTable.id))
      .orderBy(profilesTable.email),
    exec
      .select({
        id: peopleTable.id,
        fullName: peopleTable.fullName,
        email: peopleTable.email,
        profileId: peopleTable.profileId,
      })
      .from(peopleTable)
      .where(and(isNull(peopleTable.deletedAt), isNull(peopleTable.profileId))),
  ]);

  return profiles.flatMap((profile) => {
    const target = resolveApprovalTarget({
      email: profile.email,
      fullName: profile.full_name ?? "",
      candidates,
    });

    const matches =
      target.kind === "link"
        ? [target.person]
        : target.kind === "suggest"
          ? target.suggestions
          : [];

    if (!matches.length) {
      return [];
    }

    return [
      {
        profile,
        candidates: matches.map((match) => ({
          id: match.id,
          full_name: match.fullName,
          email: match.email,
        })),
      },
    ];
  });
}

async function upsertProfile(
  exec: DbExecutor,
  input: { email: string; fullName: string; role: AccessTierRole },
): Promise<string> {
  const role: AppRole = input.role;
  const rows = await exec
    .select({ id: profilesTable.id })
    .from(profilesTable)
    .where(sql`lower(${profilesTable.email}) = ${input.email}`)
    .limit(1);

  if (rows[0]) {
    await exec
      .update(profilesTable)
      .set({ role, fullName: input.fullName })
      .where(eq(profilesTable.id, rows[0].id));

    return rows[0].id;
  }

  const id = globalThis.crypto.randomUUID();
  await exec.insert(profilesTable).values({
    id,
    email: input.email,
    fullName: input.fullName,
    role,
    authUserId: null,
  });

  return id;
}

async function upsertPerson(
  exec: DbExecutor,
  input: {
    personId: string | null;
    profileId: string;
    email: string;
    fullName: string;
    phone: string;
    roleId: string | null;
    actor: Actor;
  },
): Promise<string> {
  if (input.personId) {
    const stamped = stampUpdate(input.actor, {});
    const updated = await exec
      .update(peopleTable)
      .set({
        fullName: input.fullName,
        phone: input.phone,
        email: input.email,
        roleId: input.roleId,
        active: true,
        deletedAt: null,
        profileId: input.profileId,
        updatedBy: stamped.updated_by,
        updatedAt: stamped.updated_at,
      })
      .where(eq(peopleTable.id, input.personId))
      .returning({ id: peopleTable.id });

    if (!updated[0]) {
      throw new Error("No pudimos crear la ficha de la persona.");
    }

    return updated[0].id;
  }

  const stamped = stampInsert(input.actor, {});
  const inserted = await exec
    .insert(peopleTable)
    .values({
      fullName: input.fullName,
      phone: input.phone,
      email: input.email,
      roleId: input.roleId,
      active: true,
      profileId: input.profileId,
      createdBy: stamped.created_by,
      updatedBy: stamped.updated_by,
      createdAt: stamped.created_at,
      updatedAt: stamped.updated_at,
    })
    .returning({ id: peopleTable.id });

  if (!inserted[0]) {
    throw new Error("No pudimos crear la ficha de la persona.");
  }

  return inserted[0].id;
}

async function mergePersonInto(
  exec: DbExecutor,
  input: { fromPersonId: string; intoPersonId: string; actor: Actor },
) {
  const { fromPersonId, intoPersonId } = input;

  await exec
    .update(assignmentsTable)
    .set({ personId: intoPersonId })
    .where(eq(assignmentsTable.personId, fromPersonId));

  await exec
    .update(matchesTable)
    .set({ ownerId: intoPersonId })
    .where(eq(matchesTable.ownerId, fromPersonId));

  await exec
    .update(notificationLogsTable)
    .set({ personId: intoPersonId })
    .where(eq(notificationLogsTable.personId, fromPersonId));

  // people_teams and person_functions are (person, x) unique pairs: move the
  // ones the survivor lacks and drop the rest rather than fight the constraint.
  const survivorTeams = await exec
    .select({ teamId: peopleTeamsTable.teamId })
    .from(peopleTeamsTable)
    .where(eq(peopleTeamsTable.personId, intoPersonId));
  const survivorTeamIds = survivorTeams.map((row) => row.teamId);

  if (survivorTeamIds.length) {
    await exec
      .delete(peopleTeamsTable)
      .where(
        and(
          eq(peopleTeamsTable.personId, fromPersonId),
          inArray(peopleTeamsTable.teamId, survivorTeamIds),
        ),
      );
  }

  await exec
    .update(peopleTeamsTable)
    .set({ personId: intoPersonId })
    .where(eq(peopleTeamsTable.personId, fromPersonId));

  const survivorFunctions = await exec
    .select({ functionKey: personFunctionsTable.functionKey })
    .from(personFunctionsTable)
    .where(eq(personFunctionsTable.personId, intoPersonId));
  const survivorFunctionKeys = survivorFunctions.map((row) => row.functionKey);

  if (survivorFunctionKeys.length) {
    await exec
      .delete(personFunctionsTable)
      .where(
        and(
          eq(personFunctionsTable.personId, fromPersonId),
          inArray(personFunctionsTable.functionKey, survivorFunctionKeys),
        ),
      );
  }

  await exec
    .update(personFunctionsTable)
    .set({ personId: intoPersonId })
    .where(eq(personFunctionsTable.personId, fromPersonId));

  const stamped = stampUpdate(input.actor, {});
  await exec
    .update(peopleTable)
    .set({
      deletedAt: stamped.updated_at,
      active: false,
      profileId: null,
      updatedBy: stamped.updated_by,
      updatedAt: stamped.updated_at,
    })
    .where(eq(peopleTable.id, fromPersonId));
}
