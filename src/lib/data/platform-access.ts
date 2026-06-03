import "server-only";

import { resolveDashboardAccessRole } from "@/lib/constants";
import type { AppRole } from "@/lib/database.types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function personHasPlatformAccess(
  email: string | null | undefined,
): Promise<boolean> {
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail) {
    return false;
  }

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const usersResult = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (usersResult.error) {
      console.error(
        "[platform-access] failed to list auth users",
        usersResult.error,
      );
      return false;
    }

    const authUser = usersResult.data.users.find(
      (candidate) => candidate.email?.toLowerCase() === normalizedEmail,
    );

    if (!authUser) {
      return false;
    }

    const profileQuery = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", authUser.id)
      .maybeSingle();

    if (profileQuery.error) {
      console.error(
        "[platform-access] failed to load profile",
        profileQuery.error,
      );
      return false;
    }

    return (
      resolveDashboardAccessRole({
        profileRole:
          (profileQuery.data?.role as AppRole | null | undefined) ?? null,
        appMetadata:
          (authUser.app_metadata as Record<string, unknown> | null) ?? null,
      }) === "collaborator"
    );
  } catch (error) {
    console.error("[platform-access] unexpected failure", error);
    return false;
  }
}
