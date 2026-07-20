import "server-only";

import { ilike } from "drizzle-orm";

import type { AppRole, ProfileRow } from "@/lib/database.types";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";

// Profile roles that grant a platform login. Kept in sync with PLATFORM_ACCESS_ROLES
// in src/app/actions/people.ts.
const PLATFORM_ACCESS_ROLES: readonly AppRole[] = [
  "admin",
  "editor",
  "collaborator",
];

// Returns the active platform-access tier for an email, or null if the person
// has no login. Callers use the tier to decide whether the current manager is
// allowed to revoke it (see canManageAccessTier).
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
      .select({ email: profiles.email, role: profiles.role })
      .from(profiles)
      .where(ilike(profiles.email, escapeLikePattern(normalizedEmail)))
      .limit(1);

    const profile = (rows as Pick<ProfileRow, "email" | "role">[])[0];

    if (
      profile?.role &&
      (PLATFORM_ACCESS_ROLES as readonly string[]).includes(profile.role)
    ) {
      return profile.role;
    }

    return null;
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
