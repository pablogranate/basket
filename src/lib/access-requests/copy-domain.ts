import "server-only";

import { eq, inArray } from "drizzle-orm";

import { PORTAL_APP } from "@/lib/acceso/portal";
import {
  carryOverAccessRequestDecision,
  isPendingAccessRequest,
} from "@/lib/access-requests/requests";
import { authAccessRequest, authUser } from "@/lib/auth/schema";
import { authDb } from "@/lib/db/auth-client";
import { db } from "@/lib/db/client";
import {
  accessRequests as domainAccessRequests,
  profiles as profilesTable,
} from "@/lib/db/schema";

// One-off copy for basket#198 (ADR 0011): every Domain DB `access_requests` row
// becomes an Auth DB Solicitud for the portal, keeping its id so a re-run
// skips what is already there. The re-run after the deploy also carries over
// a decision the old build made after the first run: a copied row still
// pending in the Auth DB takes the Domain row's decision. `decided_by` pointed at a Cuenta; it becomes
// that Cuenta's identity, or null when the Cuenta was never linked. A row whose
// applicant identity no longer exists can't satisfy the foreign key and is
// reported instead of copied. The Domain table is dropped later (#204).
//
// Cross-database on purpose, so this cannot be a SQL migration. Run
// `pnpm db:auth:copy-access-requests` after the 0006 Auth DB migration.

export type CopyAccessRequestsReport = {
  copied: string[];
  alreadyCopied: string[];
  // Copied while pending, decided by the old build since: decision carried over.
  resynced: string[];
  // Applicant identity missing from the Auth DB.
  missingIdentity: { id: string; email: string }[];
  // A pending row whose applicant already has a pending portal Solicitud in
  // the Auth DB (filed after the switch); the Auth DB one wins.
  pendingConflict: { id: string; email: string }[];
  // Decided rows whose decider Cuenta had no identity: copied with a null
  // decided_by.
  deciderUnmapped: string[];
};

export async function copyDomainAccessRequests(
  options: { dryRun?: boolean } = {},
): Promise<CopyAccessRequestsReport> {
  const dryRun = options.dryRun ?? false;
  const rows = await db
    .select({
      id: domainAccessRequests.id,
      authUserId: domainAccessRequests.authUserId,
      email: domainAccessRequests.email,
      fullName: domainAccessRequests.fullName,
      phone: domainAccessRequests.phone,
      funcion: domainAccessRequests.funcion,
      mensaje: domainAccessRequests.mensaje,
      ciudad: domainAccessRequests.ciudad,
      status: domainAccessRequests.status,
      createdAt: domainAccessRequests.createdAt,
      decidedAt: domainAccessRequests.decidedAt,
      decidedBy: domainAccessRequests.decidedBy,
      deciderIdentity: profilesTable.authUserId,
      personId: domainAccessRequests.personId,
    })
    .from(domainAccessRequests)
    .leftJoin(profilesTable, eq(domainAccessRequests.decidedBy, profilesTable.id))
    .orderBy(domainAccessRequests.createdAt);

  const report: CopyAccessRequestsReport = {
    copied: [],
    alreadyCopied: [],
    resynced: [],
    missingIdentity: [],
    pendingConflict: [],
    deciderUnmapped: [],
  };

  if (!rows.length) {
    return report;
  }

  const identityIds = [
    ...new Set(
      rows.flatMap((row) =>
        row.deciderIdentity ? [row.authUserId, row.deciderIdentity] : [row.authUserId],
      ),
    ),
  ];
  const [existing, identities] = await Promise.all([
    authDb
      .select({ id: authAccessRequest.id, status: authAccessRequest.status })
      .from(authAccessRequest)
      .where(inArray(authAccessRequest.id, rows.map((row) => row.id))),
    authDb
      .select({ id: authUser.id })
      .from(authUser)
      .where(inArray(authUser.id, identityIds)),
  ]);
  const existingStatus = new Map(existing.map((row) => [row.id, row.status]));
  const knownIdentities = new Set(identities.map((row) => row.id));

  for (const row of rows) {
    const decidedBy =
      row.deciderIdentity && knownIdentities.has(row.deciderIdentity)
        ? row.deciderIdentity
        : null;
    const copiedStatus = existingStatus.get(row.id);

    if (copiedStatus) {
      if (
        !isPendingAccessRequest({ status: copiedStatus }) ||
        isPendingAccessRequest(row)
      ) {
        report.alreadyCopied.push(row.id);
        continue;
      }

      if (!dryRun) {
        await carryOverAccessRequestDecision(authDb, {
          id: row.id,
          outcome: row.status,
          decidedAt: row.decidedAt ? new Date(row.decidedAt) : null,
          deciderId: decidedBy,
          personId: row.personId,
        });
      }
      report.resynced.push(row.id);
      continue;
    }

    if (!knownIdentities.has(row.authUserId)) {
      report.missingIdentity.push({ id: row.id, email: row.email });
      continue;
    }

    if (row.decidedBy && !decidedBy) {
      report.deciderUnmapped.push(row.id);
    }

    if (dryRun) {
      report.copied.push(row.id);
      continue;
    }

    // DO NOTHING without a target also absorbs the pending partial unique
    // indexes: a row that hits one is a pending conflict, not a failure.
    const inserted = await authDb
      .insert(authAccessRequest)
      .values({
        id: row.id,
        userId: row.authUserId,
        app: PORTAL_APP,
        email: row.email.trim().toLowerCase(),
        fullName: row.fullName,
        phone: row.phone,
        funcion: row.funcion,
        ciudad: row.ciudad,
        mensaje: row.mensaje,
        status: row.status,
        createdAt: new Date(row.createdAt),
        decidedAt: row.decidedAt ? new Date(row.decidedAt) : null,
        decidedBy,
        personId: row.personId,
      })
      .onConflictDoNothing()
      .returning({ id: authAccessRequest.id });

    if (inserted.length) {
      report.copied.push(row.id);
    } else {
      report.pendingConflict.push({ id: row.id, email: row.email });
    }
  }

  return report;
}
