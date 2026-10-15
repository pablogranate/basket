import "server-only";

import { and, count, desc, eq, gte, inArray, max } from "drizzle-orm";

import type { ExistingAccountMatch } from "@/lib/access-requests/approval";
import { getEffectiveAccess } from "@/lib/acceso/accesos";
import { authAccount, authAuditLog, authSession, authUser } from "@/lib/auth/schema";
import { formatMatchDateTime } from "@/lib/date";
import { authDb } from "@/lib/db/auth-client";
import { db } from "@/lib/db/client";
import {
  assignments as assignmentsTable,
  matches as matchesTable,
  profiles as profilesTable,
} from "@/lib/db/schema";
import { APP_ROLE_LABELS, isAppRole } from "@/lib/roles";

// What the approver sees about the account the applicant already has: how it
// logs in, whether it holds the portal, what its ficha carries and what was
// decided about it. Read only for flagged requests, which are rare.

export type ExistingAccountResolution = "keepExisting" | "keepNew" | "separate";

export type ExistingAccountView = {
  personId: string;
  fullName: string;
  reasons: ExistingAccountMatch["reasons"];
  email: string;
  login: "Google" | "Enlace al mail";
  accessLabel: string | null;
  lastLoginLabel: string | null;
  assignmentCount: number;
  upcomingCount: number;
  history: { label: string; when: string }[];
  // Keep the login that works; move the ficha only when the old one can't get in.
  recommended: Exclude<ExistingAccountResolution, "separate">;
};

const HISTORY_ACTIONS = ["access-request.aprobada", "access-request.rechazada", "access.revoked"];

function describeEvent(action: string, actorName: string | null) {
  const by = actorName ? ` por ${actorName}` : "";

  if (action === "access-request.aprobada") return `Solicitud aprobada${by}`;
  if (action === "access-request.rechazada") return `Solicitud rechazada${by}`;
  return `Acceso revocado${by}`;
}

export async function describeExistingAccount(
  match: ExistingAccountMatch,
): Promise<ExistingAccountView | null> {
  const { person } = match;

  if (!person.profileId) {
    return null;
  }

  const [profile] = await db
    .select({ email: profilesTable.email, authUserId: profilesTable.authUserId })
    .from(profilesTable)
    .where(eq(profilesTable.id, person.profileId))
    .limit(1);

  if (!profile) {
    return null;
  }

  const authUserId = profile.authUserId;
  const nowIso = new Date().toISOString();

  const [google, session, access, events, [assignmentTotals], [upcomingTotals]] =
    await Promise.all([
      authUserId
        ? authDb
            .select({ id: authAccount.id })
            .from(authAccount)
            .where(and(eq(authAccount.userId, authUserId), eq(authAccount.providerId, "google")))
            .limit(1)
        : [],
      authUserId
        ? authDb
            .select({ last: max(authSession.updatedAt) })
            .from(authSession)
            .where(eq(authSession.userId, authUserId))
        : [],
      authUserId ? getEffectiveAccess(authUserId, "portal") : null,
      authUserId
        ? authDb
            .select({
              action: authAuditLog.action,
              createdAt: authAuditLog.createdAt,
              actorName: authUser.name,
            })
            .from(authAuditLog)
            .leftJoin(authUser, eq(authUser.id, authAuditLog.actorId))
            .where(
              and(
                eq(authAuditLog.targetUserId, authUserId),
                inArray(authAuditLog.action, HISTORY_ACTIONS),
              ),
            )
            .orderBy(desc(authAuditLog.createdAt))
            .limit(5)
        : [],
      db
        .select({ total: count() })
        .from(assignmentsTable)
        .where(eq(assignmentsTable.personId, person.id)),
      db
        .select({ total: count() })
        .from(assignmentsTable)
        .innerJoin(matchesTable, eq(matchesTable.id, assignmentsTable.matchId))
        .where(
          and(eq(assignmentsTable.personId, person.id), gte(matchesTable.kickoffAt, nowIso)),
        ),
    ]);

  const lastLogin = session[0]?.last ?? null;
  const accessLabel =
    access && isAppRole(access.role) ? APP_ROLE_LABELS[access.role] : null;

  return {
    personId: person.id,
    fullName: person.fullName,
    reasons: match.reasons,
    email: profile.email,
    login: google[0] ? "Google" : "Enlace al mail",
    accessLabel,
    lastLoginLabel: lastLogin ? formatMatchDateTime(new Date(lastLogin).toISOString()) : null,
    assignmentCount: Number(assignmentTotals?.total ?? 0),
    upcomingCount: Number(upcomingTotals?.total ?? 0),
    history: events
      .reverse()
      .map((event) => ({
        label: describeEvent(event.action, event.actorName || null),
        when: formatMatchDateTime(new Date(event.createdAt).toISOString()),
      })),
    recommended: accessLabel ? "keepExisting" : "keepNew",
  };
}
