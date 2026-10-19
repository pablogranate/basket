import "server-only";

import {
  getEffectiveAccess,
  grantRole,
  listEffectiveAccessForApp,
  revokeRole,
} from "@/lib/acceso/accesos";
import type { AppRole } from "@/lib/database.types";
import type { AuthDbExecutor } from "@/lib/db/auth-client";
import { isAppRole } from "@/lib/roles";

// The portal's own Acceso (ADR 0010): Externo / Productor / Admin are catalog
// roles of app `portal`, keyed exactly like AppRole. Read per request, never
// cached, so a revoke or re-tier applies on the next hit.

export const PORTAL_APP = "portal";

export type PortalAccess = { role: AppRole; superAdmin: boolean };

// Throws on an Auth DB failure; callers decide how to degrade.
export async function getPortalAccess(
  userId: string,
): Promise<PortalAccess | null> {
  const access = await getEffectiveAccess(userId, PORTAL_APP);

  if (!access) {
    return null;
  }

  if (!isAppRole(access.role)) {
    console.error("[acceso] portal Acceso holds an unknown role", access.role);
    return null;
  }

  return { role: access.role, superAdmin: access.viaSuperadmin };
}

// Portal role per identity id. Throws on an Auth DB failure, like
// getPortalAccess.
export async function listPortalRolesByUser(): Promise<Map<string, AppRole>> {
  const rows = await listEffectiveAccessForApp(PORTAL_APP);
  const roles = new Map<string, AppRole>();

  for (const row of rows) {
    if (isAppRole(row.role)) {
      roles.set(row.userId, row.role);
    }
  }

  return roles;
}

export async function grantPortalRole(
  input: { userId: string; role: AppRole; grantedBy: string | null },
  exec?: AuthDbExecutor,
): Promise<void> {
  await grantRole({ ...input, app: PORTAL_APP }, exec);
}

export async function revokePortalRole(
  userId: string,
  actorId: string | null,
): Promise<boolean> {
  return revokeRole({ userId, app: PORTAL_APP, actorId });
}
