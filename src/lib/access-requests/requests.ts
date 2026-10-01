import "server-only";

import { and, desc, eq, ne } from "drizzle-orm";

import type { AccessRequestStatus } from "@/lib/access-requests/constants";
import { authAccessRequest, authAuditLog, authUser } from "@/lib/auth/schema";
import type { AuthDbExecutor } from "@/lib/db/auth-client";
import { isUniqueViolation } from "@/lib/db/errors";

// The one module that reads and writes Solicitudes de acceso
// (`auth_access_request`, ADR 0011). A Solicitud asks for one app. The status
// vocabulary (pendiente → aprobada | rechazada) and the rules around it live
// here and nowhere else:
//
// - One PENDING request per app, per email and per identity. Enforced by the
//   partial unique indexes on the table; this module only translates the
//   violation. Pending Solicitudes to two different apps never block each other.
// - A resolved request never blocks a new one: an approved email standing here
//   again means its access was revoked, and self-signup is the only door back
//   in — so a resolved request must never read as "in review".
// - First decision wins (D-06). The claim is a compare-and-set on the status
//   column; the decider who loses it is told the request is already decided.
//   Every decider (apex, portal, the app itself) claims the same row.

export type AccessRequestSummary = {
  id: string;
  app: string;
  email: string;
  full_name: string;
  phone: string;
  funcion: string | null;
  mensaje: string | null;
  ciudad: string | null;
  status: AccessRequestStatus;
  created_at: string;
  decided_at: string | null;
  decided_by_name: string | null;
};

export type OwnAccessRequest = Omit<AccessRequestSummary, "decided_by_name">;

export type AccessRequestOutcome = Exclude<AccessRequestStatus, "pendiente">;

const PENDING: AccessRequestStatus = "pendiente";

const requestColumns = {
  id: authAccessRequest.id,
  app: authAccessRequest.app,
  email: authAccessRequest.email,
  full_name: authAccessRequest.fullName,
  phone: authAccessRequest.phone,
  funcion: authAccessRequest.funcion,
  mensaje: authAccessRequest.mensaje,
  ciudad: authAccessRequest.ciudad,
  status: authAccessRequest.status,
  created_at: authAccessRequest.createdAt,
  decided_at: authAccessRequest.decidedAt,
} as const;

// Timestamps leave this module as ISO strings, the shape pages already format.
type RawRequestRow = Omit<OwnAccessRequest, "status" | "created_at" | "decided_at"> & {
  status: string;
  created_at: Date;
  decided_at: Date | null;
};

function toSummary<R extends RawRequestRow>(
  row: R,
): Omit<R, "status" | "created_at" | "decided_at"> &
  Pick<AccessRequestSummary, "status" | "created_at" | "decided_at"> {
  return {
    ...row,
    status: row.status as AccessRequestStatus,
    created_at: row.created_at.toISOString(),
    decided_at: row.decided_at?.toISOString() ?? null,
  };
}

export function isPendingAccessRequest(
  request: { status: string } | null | undefined,
): boolean {
  return request?.status === PENDING;
}

export async function submitAccessRequest(
  exec: AuthDbExecutor,
  input: {
    userId: string;
    app: string;
    email: string;
    fullName: string;
    phone: string;
    funcion: string | null;
    ciudad: string;
    mensaje: string | null;
  },
): Promise<{ id: string; email: string }> {
  const email = input.email.trim().toLowerCase();

  try {
    const inserted = await exec
      .insert(authAccessRequest)
      .values({
        userId: input.userId,
        app: input.app,
        email,
        fullName: input.fullName,
        phone: input.phone,
        funcion: input.funcion,
        ciudad: input.ciudad,
        mensaje: input.mensaje,
        status: PENDING,
      })
      .returning({ id: authAccessRequest.id });

    return { id: inserted[0]!.id, email };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error("Ya tenés una solicitud pendiente.");
    }

    throw error;
  }
}

// Compare-and-set: the status predicate is what serializes two deciders
// clicking at once, not any read before it. `app` scopes the claim to the
// decider's app, so a portal approver can never settle another app's request.
// Returns the row the winner claimed.
export async function claimAccessRequest(
  exec: AuthDbExecutor,
  input: {
    id: string;
    app: string;
    outcome: AccessRequestOutcome;
    deciderId: string | null;
    grantedRole?: string | null;
  },
): Promise<{ id: string; email: string; userId: string }> {
  const claimed = await exec
    .update(authAccessRequest)
    .set({
      status: input.outcome,
      decidedAt: new Date(),
      decidedBy: input.deciderId,
      grantedRole: input.grantedRole ?? null,
    })
    .where(
      and(
        eq(authAccessRequest.id, input.id),
        eq(authAccessRequest.app, input.app),
        eq(authAccessRequest.status, PENDING),
      ),
    )
    .returning({
      id: authAccessRequest.id,
      email: authAccessRequest.email,
      userId: authAccessRequest.userId,
    });

  if (!claimed[0]) {
    throw new Error("Esta solicitud ya fue resuelta.");
  }

  return {
    id: claimed[0].id,
    email: claimed[0].email.trim().toLowerCase(),
    userId: claimed[0].userId,
  };
}

// Every decision, from any decider, lands in auth_audit_log (ADR 0011). Pass
// the claim's transaction so the row commits or rolls back with the decision.
export async function recordAccessRequestDecision(
  exec: AuthDbExecutor,
  input: {
    deciderId: string | null;
    claimed: { id: string; userId: string; email: string };
    app: string;
    outcome: AccessRequestOutcome;
    grantedRole?: string | null;
  },
): Promise<void> {
  await exec.insert(authAuditLog).values({
    actorId: input.deciderId,
    targetUserId: input.claimed.userId,
    action: `access-request.${input.outcome}`,
    detail: {
      requestId: input.claimed.id,
      app: input.app,
      email: input.claimed.email,
      grantedRole: input.grantedRole ?? null,
    },
  });
}

// Records which ficha an approved portal request ended up as.
export async function attachAccessRequestPerson(
  exec: AuthDbExecutor,
  input: { id: string; personId: string },
): Promise<void> {
  await exec
    .update(authAccessRequest)
    .set({ personId: input.personId })
    .where(eq(authAccessRequest.id, input.id));
}

// The applicant's own standing in one app. Authorization is the session
// itself: the row is looked up by the caller's identity, so there is nothing
// else to gate. An identity may hold several rows per app once a resolved
// request no longer blocks a new one; only the newest describes where the
// applicant stands.
export async function getOwnAccessRequest(
  exec: AuthDbExecutor,
  input: { userId: string; app: string },
): Promise<{ request: OwnAccessRequest | null; pending: boolean }> {
  const rows = await exec
    .select(requestColumns)
    .from(authAccessRequest)
    .where(
      and(
        eq(authAccessRequest.userId, input.userId),
        eq(authAccessRequest.app, input.app),
      ),
    )
    .orderBy(desc(authAccessRequest.createdAt))
    .limit(1);

  const request = rows[0] ? toSummary(rows[0]) : null;

  return { request, pending: isPendingAccessRequest(request) };
}

// The applicant's newest Solicitud in any app: someone granted the portal
// after joining through another app pre-fills their ficha from it.
export async function getLatestOwnAccessRequest(
  exec: AuthDbExecutor,
  input: { userId: string },
): Promise<OwnAccessRequest | null> {
  const rows = await exec
    .select(requestColumns)
    .from(authAccessRequest)
    .where(eq(authAccessRequest.userId, input.userId))
    .orderBy(desc(authAccessRequest.createdAt))
    .limit(1);

  return rows[0] ? toSummary(rows[0]) : null;
}

export async function listPendingAccessRequests(
  exec: AuthDbExecutor,
  input: { app: string },
): Promise<AccessRequestSummary[]> {
  const rows = await exec
    .select({ ...requestColumns, decided_by_name: authUser.name })
    .from(authAccessRequest)
    .leftJoin(authUser, eq(authAccessRequest.decidedBy, authUser.id))
    .where(
      and(
        eq(authAccessRequest.app, input.app),
        eq(authAccessRequest.status, PENDING),
      ),
    )
    .orderBy(desc(authAccessRequest.createdAt));

  return rows.map(toSummary);
}

// Every app's pending Solicitudes, for the super admins' bell on the apex.
export async function listAllPendingAccessRequests(
  exec: AuthDbExecutor,
): Promise<AccessRequestSummary[]> {
  const rows = await exec
    .select({ ...requestColumns, decided_by_name: authUser.name })
    .from(authAccessRequest)
    .leftJoin(authUser, eq(authAccessRequest.decidedBy, authUser.id))
    .where(eq(authAccessRequest.status, PENDING))
    .orderBy(desc(authAccessRequest.createdAt));

  return rows.map(toSummary);
}

export async function listDecidedAccessRequests(
  exec: AuthDbExecutor,
  input: { app: string },
): Promise<AccessRequestSummary[]> {
  const rows = await exec
    .select({ ...requestColumns, decided_by_name: authUser.name })
    .from(authAccessRequest)
    .leftJoin(authUser, eq(authAccessRequest.decidedBy, authUser.id))
    .where(
      and(
        eq(authAccessRequest.app, input.app),
        ne(authAccessRequest.status, PENDING),
      ),
    )
    .orderBy(desc(authAccessRequest.decidedAt));

  return rows.map(toSummary);
}
