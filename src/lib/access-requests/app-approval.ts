import "server-only";

import { and, eq } from "drizzle-orm";

import { grantRole } from "@/lib/acceso/accesos";
import { PORTAL_APP } from "@/lib/acceso/portal";
import {
  claimAccessRequest,
  recordAccessRequestDecision,
} from "@/lib/access-requests/requests";
import { authAppRole } from "@/lib/auth/schema";
import { authDb } from "@/lib/db/auth-client";

// A sibling Solicitud is decided in the Auth DB alone: the claim, the Acceso
// and the audit row commit together, so a request is never `aprobada` without
// its role. No Cuenta and no ficha: only a portal approval makes those.

type Decision = {
  requestId: string;
  app: string;
  deciderId: string;
};

export type AppApproval = { email: string; userId: string; roleLabel: string };

export async function approveAppAccessRequest(
  input: Decision & { role: string },
): Promise<AppApproval> {
  if (input.app === PORTAL_APP) {
    throw new Error("Las solicitudes del portal se aprueban con su formulario.");
  }

  return authDb.transaction(async (tx) => {
    // The FK would reject an unknown role too; checking first gives a notice
    // instead of a constraint error.
    const [role] = await tx
      .select({ label: authAppRole.label })
      .from(authAppRole)
      .where(and(eq(authAppRole.app, input.app), eq(authAppRole.key, input.role)))
      .limit(1);

    if (!role) {
      throw new Error("Ese rol no existe en la app pedida.");
    }

    const claimed = await claimAccessRequest(tx, {
      id: input.requestId,
      app: input.app,
      outcome: "aprobada",
      deciderId: input.deciderId,
      grantedRole: input.role,
    });

    await grantRole(
      {
        userId: claimed.userId,
        app: input.app,
        role: input.role,
        grantedBy: input.deciderId,
      },
      tx,
    );
    await recordAccessRequestDecision(tx, {
      deciderId: input.deciderId,
      claimed,
      app: input.app,
      outcome: "aprobada",
      grantedRole: input.role,
    });

    return { email: claimed.email, userId: claimed.userId, roleLabel: role.label };
  });
}

// Silent (D-16): nothing tells the applicant.
export async function rejectAppAccessRequest(input: Decision): Promise<void> {
  if (input.app === PORTAL_APP) {
    throw new Error("Las solicitudes del portal se rechazan desde su formulario.");
  }

  await authDb.transaction(async (tx) => {
    const claimed = await claimAccessRequest(tx, {
      id: input.requestId,
      app: input.app,
      outcome: "rechazada",
      deciderId: input.deciderId,
    });

    await recordAccessRequestDecision(tx, {
      deciderId: input.deciderId,
      claimed,
      app: input.app,
      outcome: "rechazada",
    });
  });
}
