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
export async function getPlatformAccessRole(
  email: string | null | undefined,
): Promise<AppRole | null> {
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const result = await supabaseAdmin.from("profiles").select("email, role");

    if (result.error) {
      console.error("[platform-access] failed to load profiles", result.error);
      return null;
    }

    const profile = (
      (result.data as Pick<ProfileRow, "email" | "role">[] | null) ?? []
    ).find((row) => row.email?.toLowerCase() === normalizedEmail);

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
