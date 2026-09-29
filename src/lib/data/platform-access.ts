import "server-only";

import { ilike } from "drizzle-orm";

import { getPortalAccess } from "@/lib/acceso/portal";
import type { AppRole } from "@/lib/database.types";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";

// Returns the portal role of the Cuenta with this email, or null when there is
// no Cuenta or its identity holds no portal Acceso. Callers use it to decide
// whether the current manager may re-tier or revoke it (canGrantRole).
function escapeLikePattern(value: string) {
  return value.replaceAll(/[\\%_]/g, (char) => `\\${char}`);
}

export async function getPlatformAccessRole(
  email: string | null | undefined,
): Promise<AppRole | null> {
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  try {
    // Case-insensitive exact match resolved in SQL (wildcards escaped) so the
    // DB returns at most one row instead of the whole table.
    const rows = await db
      .select({ authUserId: profiles.authUserId })
      .from(profiles)
      .where(ilike(profiles.email, escapeLikePattern(normalizedEmail)))
      .limit(1);
    const authUserId = rows[0]?.authUserId;

    if (!authUserId) {
      return null;
    }

    return (await getPortalAccess(authUserId))?.role ?? null;
  } catch (error) {
    console.error("[platform-access] unexpected failure", error);
    return null;
  }
}

export async function personHasPlatformAccess(
  email: string | null | undefined,
): Promise<boolean> {
  return (await getPlatformAccessRole(email)) !== null;
}
