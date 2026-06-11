import "server-only";

import type { ProfileRow } from "@/lib/database.types";
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
    const result = await supabaseAdmin.from("profiles").select("email, role");

    if (result.error) {
      console.error("[platform-access] failed to load profiles", result.error);
      return false;
    }

    const profile = (
      (result.data as Pick<ProfileRow, "email" | "role">[] | null) ?? []
    ).find((row) => row.email?.toLowerCase() === normalizedEmail);

    return (
      profile?.role === "admin" ||
      profile?.role === "editor" ||
      profile?.role === "collaborator"
    );
  } catch (error) {
    console.error("[platform-access] unexpected failure", error);
    return false;
  }
}
