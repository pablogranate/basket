import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { getEffectiveAccess, retireIdentityInto } from "@/lib/acceso/accesos";
import { grantPortalRole, PORTAL_APP } from "@/lib/acceso/portal";
import {
  attachAccessRequestPerson,
  claimAccessRequest,
  recordAccessRequestDecision,
} from "@/lib/access-requests/requests";
import type { AppRole } from "@/lib/database.types";
import { authDb } from "@/lib/db/auth-client";
import { db } from "@/lib/db/client";
import {
  people as peopleTable,
  profiles as profilesTable,
} from "@/lib/db/schema";
import { moveCuentaToApplicant, settleApplicant } from "@/lib/people/identity";

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

// The applicant already has another login with a ficha (findExistingAccount)
// and the approver kept the new one: the ficha's Cuenta moves to the
// applicant's login and the old login is retired, all or nothing across both
// databases, like approvePortalAccessRequest.
export async function approvePortalAccessRequestMovingFicha(
  input: Omit<PortalApprovalInput, "personId" | "mergePersonId"> & {
    existingPersonId: string;
  },
): Promise<PortalApproval & { retiredAuthUserId: string | null }> {
  return authDb.transaction(async (authTx) => {
    const claimed = await claimAccessRequest(authTx, {
      id: input.requestId,
      app: PORTAL_APP,
      outcome: "aprobada",
      deciderId: input.deciderId,
      grantedRole: input.accessRole,
    });

    const moved = await db.transaction(async (domainTx) => {
      const cuenta = await moveCuentaToApplicant(domainTx, {
        personId: input.existingPersonId,
        email: claimed.email,
        fullName: input.fullName,
        phone: input.phone,
        roleId: input.roleId,
        authUserId: claimed.userId,
        actor: input.actor,
      });

      if (cuenta.previousAuthUserId) {
        await retireIdentityInto(authTx, {
          fromUserId: cuenta.previousAuthUserId,
          intoUserId: claimed.userId,
          actorId: input.deciderId,
        });
      }

      await grantPortalRole(
        { userId: claimed.userId, role: input.accessRole, grantedBy: input.deciderId },
        authTx,
      );
      await attachAccessRequestPerson(authTx, {
        id: input.requestId,
        personId: cuenta.personId,
      });
      await recordAccessRequestDecision(authTx, {
        deciderId: input.deciderId,
        claimed,
        app: PORTAL_APP,
        outcome: "aprobada",
        grantedRole: input.accessRole,
      });

      return cuenta;
    });

    return {
      email: claimed.email,
      profileId: moved.profileId,
      personId: moved.personId,
      authUserId: claimed.userId,
      retiredAuthUserId: moved.previousAuthUserId,
    };
  });
}

// The approver kept the login the person already has: this Solicitud is
// rejected (no second login, no second ficha) and the caller tells the
// applicant which email to use. If that login lost the portal, it gets it back
// at the chosen level in the same transaction.
export async function rejectInFavorOfExistingAccount(input: {
  requestId: string;
  deciderId: string | null;
  existingPersonId: string;
  accessRole: AppRole;
}): Promise<{ applicantEmail: string; existingEmail: string; regranted: boolean }> {
  const [existing] = await db
    .select({ email: profilesTable.email, authUserId: profilesTable.authUserId })
    .from(peopleTable)
    .innerJoin(profilesTable, eq(profilesTable.id, peopleTable.profileId))
    .where(and(eq(peopleTable.id, input.existingPersonId), isNull(peopleTable.deletedAt)))
    .limit(1);

  if (!existing?.authUserId) {
    throw new Error("Esa cuenta nunca entró al portal: elegí pasar la ficha a esta cuenta.");
  }

  const existingUserId = existing.authUserId;
  const hasAccess = Boolean(await getEffectiveAccess(existingUserId, PORTAL_APP));

  return authDb.transaction(async (tx) => {
    const claimed = await claimAccessRequest(tx, {
      id: input.requestId,
      app: PORTAL_APP,
      outcome: "rechazada",
      deciderId: input.deciderId,
    });

    if (claimed.userId === existingUserId) {
      throw new Error("La solicitud ya viene de esa cuenta.");
    }

    if (!hasAccess) {
      await grantPortalRole(
        { userId: existingUserId, role: input.accessRole, grantedBy: input.deciderId },
        tx,
      );
    }

    await recordAccessRequestDecision(tx, {
      deciderId: input.deciderId,
      claimed,
      app: PORTAL_APP,
      outcome: "rechazada",
    });

    return {
      applicantEmail: claimed.email,
      existingEmail: existing.email,
      regranted: !hasAccess,
    };
  });
}
