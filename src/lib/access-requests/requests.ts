import "server-only";

import { and, desc, eq, ne } from "drizzle-orm";

import type { AccessRequestStatus } from "@/lib/access-requests/constants";
import type { DbExecutor } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
import {
  accessRequests as accessRequestsTable,
  profiles as profilesTable,
} from "@/lib/db/schema";

// The one module that reads and writes `access_requests`. The status vocabulary
// (pendiente → aprobada | rechazada) and the rules around it live here and
// nowhere else:
//
// - One PENDING request per email and per auth user. Enforced by the partial
//   unique indexes on the table; this module only translates the violation.
// - A resolved request never blocks a new one: an approved email standing here
//   again means its access was revoked, and self-signup is the only door back
//   in — so a resolved request must never read as "in review".
// - First decision wins (D-06). The claim is a compare-and-set on the status
//   column; the approver who loses it is told the request is already decided.

export type AccessRequestSummary = {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  funcion: string;
  mensaje: string | null;
  ciudad: string | null;
  status: AccessRequestStatus;
  created_at: string;
  decided_at: string | null;
  decided_by_name: string | null;
};

export type AccessRequestOutcome = Exclude<AccessRequestStatus, "pendiente">;

const PENDING: AccessRequestStatus = "pendiente";

const requestColumns = {
  id: accessRequestsTable.id,
  email: accessRequestsTable.email,
  full_name: accessRequestsTable.fullName,
  phone: accessRequestsTable.phone,
  funcion: accessRequestsTable.funcion,
  mensaje: accessRequestsTable.mensaje,
  ciudad: accessRequestsTable.ciudad,
  status: accessRequestsTable.status,
  created_at: accessRequestsTable.createdAt,
  decided_at: accessRequestsTable.decidedAt,
} as const;

function isPendingAccessRequest(
  request: { status: string } | null | undefined,
): boolean {
  return request?.status === PENDING;
}

export async function submitAccessRequest(
  exec: DbExecutor,
  input: {
    authUserId: string;
    email: string;
    fullName: string;
    phone: string;
    funcion: string;
    ciudad: string;
    mensaje: string | null;
  },
): Promise<{ id: string; email: string }> {
  const email = input.email.trim().toLowerCase();

  try {
    const inserted = await exec
      .insert(accessRequestsTable)
      .values({
        authUserId: input.authUserId,
        email,
        fullName: input.fullName,
        phone: input.phone,
        funcion: input.funcion,
        ciudad: input.ciudad,
        mensaje: input.mensaje,
        status: PENDING,
      })
      .returning({ id: accessRequestsTable.id });

    return { id: inserted[0]!.id, email };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error("Ya tenés una solicitud pendiente.");
    }

    throw error;
  }
}

// Compare-and-set: the status predicate is what serializes two approvers
// clicking at once, not any read before it. Returns the row the winner claimed.
export async function claimAccessRequest(
  exec: DbExecutor,
  input: {
    id: string;
    outcome: AccessRequestOutcome;
    actorProfileId: string | null;
  },
): Promise<{ id: string; email: string }> {
  const claimed = await exec
    .update(accessRequestsTable)
    .set({
      status: input.outcome,
      decidedAt: new Date().toISOString(),
      decidedBy: input.actorProfileId,
    })
    .where(
      and(
        eq(accessRequestsTable.id, input.id),
        eq(accessRequestsTable.status, PENDING),
      ),
    )
    .returning({ id: accessRequestsTable.id, email: accessRequestsTable.email });

  if (!claimed[0]) {
    throw new Error("Esta solicitud ya fue resuelta.");
  }

  return { id: claimed[0].id, email: claimed[0].email.trim().toLowerCase() };
}

// Records which cuenta and ficha an approved request ended up as.
export async function attachAccessRequestIdentity(
  exec: DbExecutor,
  input: { id: string; profileId: string; personId: string },
): Promise<void> {
  await exec
    .update(accessRequestsTable)
    .set({ profileId: input.profileId, personId: input.personId })
    .where(eq(accessRequestsTable.id, input.id));
}

// The applicant's own standing. Authorization is the session itself: the row is
// looked up by the caller's auth user id, so there is nothing else to gate. An
// account may hold several rows once a resolved request no longer blocks a new
// one; only the newest describes where the applicant stands.
export async function getOwnAccessRequest(
  exec: DbExecutor,
  input: { authUserId: string },
): Promise<{
  request: Omit<AccessRequestSummary, "decided_by_name"> | null;
  pending: boolean;
}> {
  const rows = await exec
    .select(requestColumns)
    .from(accessRequestsTable)
    .where(eq(accessRequestsTable.authUserId, input.authUserId))
    .orderBy(desc(accessRequestsTable.createdAt))
    .limit(1);

  const request =
    (rows[0] as Omit<AccessRequestSummary, "decided_by_name"> | undefined) ??
    null;

  return { request, pending: isPendingAccessRequest(request) };
}

export async function listPendingAccessRequests(
  exec: DbExecutor,
): Promise<AccessRequestSummary[]> {
  const rows = await exec
    .select({ ...requestColumns, decided_by_name: profilesTable.fullName })
    .from(accessRequestsTable)
    .leftJoin(profilesTable, eq(accessRequestsTable.decidedBy, profilesTable.id))
    .where(eq(accessRequestsTable.status, PENDING))
    .orderBy(desc(accessRequestsTable.createdAt));

  return rows as AccessRequestSummary[];
}

export async function listDecidedAccessRequests(
  exec: DbExecutor,
): Promise<AccessRequestSummary[]> {
  const rows = await exec
    .select({ ...requestColumns, decided_by_name: profilesTable.fullName })
    .from(accessRequestsTable)
    .leftJoin(profilesTable, eq(accessRequestsTable.decidedBy, profilesTable.id))
    .where(ne(accessRequestsTable.status, PENDING))
    .orderBy(desc(accessRequestsTable.decidedAt));

  return rows as AccessRequestSummary[];
}
