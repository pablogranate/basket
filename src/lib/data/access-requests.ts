import "server-only";

import { and, desc, eq, isNull, ne } from "drizzle-orm";

import type { AccessRequestStatus } from "@/lib/access-requests/constants";
import type { UserContext } from "@/lib/auth";
import {
  resolveApprovalTarget,
  type ApprovalCandidate,
} from "@/lib/access-requests/approval";
import { db } from "@/lib/db/client";
import {
  accessRequests as accessRequestsTable,
  people as peopleTable,
  profiles as profilesTable,
} from "@/lib/db/schema";

export type AccessRequestSummary = {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  funcion: string;
  mensaje: string | null;
  status: AccessRequestStatus;
  created_at: string;
  decided_at: string | null;
  decided_by_name: string | null;
};

const requestColumns = {
  id: accessRequestsTable.id,
  email: accessRequestsTable.email,
  full_name: accessRequestsTable.fullName,
  phone: accessRequestsTable.phone,
  funcion: accessRequestsTable.funcion,
  mensaje: accessRequestsTable.mensaje,
  status: accessRequestsTable.status,
  created_at: accessRequestsTable.createdAt,
  decided_at: accessRequestsTable.decidedAt,
} as const;

// The applicant's own request. Authorization is the session itself: the row is
// looked up by the caller's auth user id, so there is nothing else to gate.
export async function getAccessRequestForOwnUser(ctx: UserContext) {
  if (!ctx.userId) {
    return null;
  }

  // An email may hold several rows once a resolved request no longer blocks a
  // new one; only the newest describes where the applicant stands.
  const rows = await db
    .select(requestColumns)
    .from(accessRequestsTable)
    .where(eq(accessRequestsTable.authUserId, ctx.userId))
    .orderBy(desc(accessRequestsTable.createdAt))
    .limit(1);

  return (rows[0] as Omit<AccessRequestSummary, "decided_by_name"> | undefined) ?? null;
}

// Case-insensitive so a second login with a differently-cased address still
// finds the request the first one created.
export async function getPendingAccessRequests(
  ctx: UserContext,
): Promise<AccessRequestSummary[]> {
  void ctx;
  const rows = await db
    .select({ ...requestColumns, decided_by_name: profilesTable.fullName })
    .from(accessRequestsTable)
    .leftJoin(profilesTable, eq(accessRequestsTable.decidedBy, profilesTable.id))
    .where(eq(accessRequestsTable.status, "pendiente"))
    .orderBy(desc(accessRequestsTable.createdAt));

  return rows as AccessRequestSummary[];
}

export async function getDecidedAccessRequests(
  ctx: UserContext,
): Promise<AccessRequestSummary[]> {
  void ctx;
  const rows = await db
    .select({ ...requestColumns, decided_by_name: profilesTable.fullName })
    .from(accessRequestsTable)
    .leftJoin(profilesTable, eq(accessRequestsTable.decidedBy, profilesTable.id))
    .where(ne(accessRequestsTable.status, "pendiente"))
    .orderBy(desc(accessRequestsTable.decidedAt));

  return rows as AccessRequestSummary[];
}

// Candidate `people` rows for the approve modal. Soft-deleted rows are excluded;
// inactive ones are not, because reactivating a known person beats duplicating
// them.
export type ApprovalCandidateRow = ApprovalCandidate & {
  phone: string | null;
  roleId: string | null;
};

export async function getApprovalCandidates(
  ctx: UserContext,
): Promise<ApprovalCandidateRow[]> {
  void ctx;
  const rows = await db
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

// The one-time review list the 0034 backfill leaves behind (D-09): accounts with
// access that no `people` row claims, paired with the unlinked fichas whose name
// looks like the same human. Profiles with no name match are left out — an admin
// who never appears in the grilla is normal, not a leftover.
export async function getProfileLinkReview(
  ctx: UserContext,
): Promise<LinkReviewRow[]> {
  void ctx;
  const [profiles, candidates] = await Promise.all([
    db
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
    db
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
