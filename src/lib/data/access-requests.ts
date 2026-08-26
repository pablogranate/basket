import "server-only";

import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";

import type {
  AccessRequestFuncion,
  AccessRequestStatus,
} from "@/lib/access-requests/constants";
import type { UserContext } from "@/lib/auth";
import type { ApprovalCandidate } from "@/lib/access-requests/approval";
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

  const rows = await db
    .select(requestColumns)
    .from(accessRequestsTable)
    .where(eq(accessRequestsTable.authUserId, ctx.userId))
    .limit(1);

  return (rows[0] as Omit<AccessRequestSummary, "decided_by_name"> | undefined) ?? null;
}

// Case-insensitive so a second login with a differently-cased address still
// finds the request the first one created.
export async function getAccessRequestByEmail(ctx: UserContext, email: string) {
  void ctx;
  const rows = await db
    .select(requestColumns)
    .from(accessRequestsTable)
    .where(sql`lower(${accessRequestsTable.email}) = ${email.trim().toLowerCase()}`)
    .limit(1);

  return (rows[0] as Omit<AccessRequestSummary, "decided_by_name"> | undefined) ?? null;
}

// Approver-facing reads. The route/action guards (requireApprover, requireAdmin)
// decide who may call these; the queries themselves are unscoped by design.
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

export async function getPendingAccessRequestCount(ctx: UserContext) {
  void ctx;
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(accessRequestsTable)
    .where(eq(accessRequestsTable.status, "pendiente"));

  return rows[0]?.count ?? 0;
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

// Profiles the 0034 backfill could not link by email — the one-time admin review
// list (D-09). A profile with no `people` row is normal for admins who never
// appear in the grilla, so this is a review queue, not an error list.
export async function getUnlinkedProfiles(ctx: UserContext) {
  void ctx;
  const rows = await db
    .select({
      id: profilesTable.id,
      full_name: profilesTable.fullName,
      email: profilesTable.email,
      role: profilesTable.role,
    })
    .from(profilesTable)
    .leftJoin(peopleTable, eq(peopleTable.profileId, profilesTable.id))
    .where(isNull(peopleTable.id))
    .orderBy(profilesTable.email);

  return rows;
}

export type AccessRequestRow = {
  id: string;
  authUserId: string;
  email: string;
  fullName: string;
  phone: string;
  funcion: AccessRequestFuncion | string;
  mensaje: string | null;
  status: AccessRequestStatus;
};

export async function getAccessRequestById(
  ctx: UserContext,
  id: string,
): Promise<AccessRequestRow | null> {
  void ctx;
  const rows = await db
    .select({
      id: accessRequestsTable.id,
      authUserId: accessRequestsTable.authUserId,
      email: accessRequestsTable.email,
      fullName: accessRequestsTable.fullName,
      phone: accessRequestsTable.phone,
      funcion: accessRequestsTable.funcion,
      mensaje: accessRequestsTable.mensaje,
      status: accessRequestsTable.status,
    })
    .from(accessRequestsTable)
    .where(and(eq(accessRequestsTable.id, id)))
    .limit(1);

  return (rows[0] as AccessRequestRow | undefined) ?? null;
}
