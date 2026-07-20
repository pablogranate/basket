import "server-only";

import type { AppRole, ProfileRow } from "@/lib/database.types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
    const supabaseAdmin = createSupabaseAdminClient();
    // Case-insensitive exact match resolved in SQL (wildcards escaped) so the
    // DB returns at most one row instead of the whole table.
    const result = await supabaseAdmin
      .from("profiles")
      .select("email, role")
      .ilike("email", escapeLikePattern(normalizedEmail))
      .limit(1);

    if (result.error) {
      console.error("[platform-access] failed to load profiles", result.error);
      return null;
    }

    const profile = (
      (result.data as Pick<ProfileRow, "email" | "role">[] | null) ?? []
    )[0];

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
