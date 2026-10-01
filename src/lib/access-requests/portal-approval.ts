import "server-only";

import { grantPortalRole, PORTAL_APP } from "@/lib/acceso/portal";
import {
  attachAccessRequestPerson,
  claimAccessRequest,
  recordAccessRequestDecision,
} from "@/lib/access-requests/requests";
import type { AppRole } from "@/lib/database.types";
import { authDb } from "@/lib/db/auth-client";
import { db } from "@/lib/db/client";
import { settleApplicant } from "@/lib/people/identity";

export type PortalApprovalInput = {
  requestId: string;
  // The decider's identity (auth_user.id), stored as decided_by and granted_by.
  deciderId: string | null;
  // The decider's Cuenta, for the Domain DB stamps.
  actor: { profileId: string | null };
  fullName: string;
  phone: string;
  roleId: string | null;
  personId: string | null;
  mergePersonId: string | null;
  accessRole: AppRole;
};

export type PortalApproval = {
  email: string;
  profileId: string;
  personId: string;
  authUserId: string;
};

// A portal approval writes two databases. The claim opens an Auth DB
// transaction; the ficha and Cuenta are settled in a Domain DB transaction
// nested inside it, and the Auth writes (the portal Acceso, the ficha on the
// request) join while the Domain one is still open. So either side failing
// rolls both back: no request is left `aprobada` without its grant or its
// ficha. The one window left is the Auth DB commit failing after the Domain
// one: the ficha exists, the request stays pending and a retry links to it by
// email.
export async function approvePortalAccessRequest(
  input: PortalApprovalInput,
): Promise<PortalApproval> {
  return authDb.transaction(async (authTx) => {
    // First decision wins: everything below runs only for the claim's winner.
    const claimed = await claimAccessRequest(authTx, {
      id: input.requestId,
      app: PORTAL_APP,
      outcome: "aprobada",
      deciderId: input.deciderId,
      grantedRole: input.accessRole,
    });

    const settled = await db.transaction(async (domainTx) => {
      const applicant = await settleApplicant(domainTx, {
        email: claimed.email,
        fullName: input.fullName,
        phone: input.phone,
        roleId: input.roleId,
        authUserId: claimed.userId,
        personId: input.personId,
        mergePersonId: input.mergePersonId,
        actor: input.actor,
      });

      // The identity is the Cuenta's link: an existing one, else the
      // applicant's, linked just now.
      await grantPortalRole(
        {
          userId: applicant.authUserId,
          role: input.accessRole,
          grantedBy: input.deciderId,
        },
        authTx,
      );
      await attachAccessRequestPerson(authTx, {
        id: input.requestId,
        personId: applicant.personId,
      });
      await recordAccessRequestDecision(authTx, {
        deciderId: input.deciderId,
        claimed,
        app: PORTAL_APP,
        outcome: "aprobada",
        grantedRole: input.accessRole,
      });

      return applicant;
    });

    return { ...settled, email: claimed.email };
  });
}

// Silent (D-16). The claim and its audit row commit together.
export async function rejectPortalAccessRequest(input: {
  requestId: string;
  deciderId: string | null;
}): Promise<void> {
  await authDb.transaction(async (tx) => {
    const claimed = await claimAccessRequest(tx, {
      id: input.requestId,
      app: PORTAL_APP,
      outcome: "rechazada",
      deciderId: input.deciderId,
    });

    await recordAccessRequestDecision(tx, {
      deciderId: input.deciderId,
      claimed,
      app: PORTAL_APP,
      outcome: "rechazada",
    });
  });
}
