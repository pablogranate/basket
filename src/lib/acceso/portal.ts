import "server-only";

import {
  getEffectiveAccess,
  grantRole,
  grantRoleIfAbsent,
  revokeRole,
} from "@/lib/acceso/accesos";
import type { AppRole } from "@/lib/database.types";
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

export async function grantPortalRole(input: {
  userId: string;
  role: AppRole;
  grantedBy: string | null;
}): Promise<void> {
  await grantRole({ ...input, app: PORTAL_APP });
}

export async function grantPortalRoleIfAbsent(
  input: { userId: string; role: AppRole; grantedBy: string | null },
  options: { dryRun?: boolean } = {},
): Promise<boolean> {
  return grantRoleIfAbsent({ ...input, app: PORTAL_APP }, options);
}

export async function revokePortalRole(userId: string): Promise<boolean> {
  return revokeRole({ userId, app: PORTAL_APP });
}
