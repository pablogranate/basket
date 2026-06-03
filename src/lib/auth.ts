import { redirect } from "next/navigation";

import { resolveDashboardAccessRole } from "@/lib/constants";
import type { AppRole, ProfileRow } from "@/lib/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseUserSafely } from "@/lib/supabase/auth-session";

function buildFallbackProfile(user: {
  id: string;
  email?: string | null;
  user_metadata?: { full_name?: string | null } | null;
}): ProfileRow {
  const fallbackName =
    user.user_metadata?.full_name?.trim() ||
    user.email?.split("@")[0] ||
    "Usuario";
  const now = new Date().toISOString();

  return {
    id: user.id,
    full_name: fallbackName,
    role: "viewer",
    created_at: now,
    updated_at: now,
  };
}

export type UserContext = Awaited<ReturnType<typeof getUserContext>>;

export async function getUserContext() {
  const supabase = await createSupabaseServerClient();
  const { user } = await getSupabaseUserSafely(supabase);

  if (!user) {
    return {
      userId: null,
      email: null,
      profile: null,
      role: "viewer" as AppRole,
      canEdit: false,
    };
  }

  const fallbackProfile = buildFallbackProfile(user);
  let profile: ProfileRow | null = null;
  const profileQuery = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileQuery.error) {
    console.error("[auth] failed to load profile", profileQuery.error);
    const resolvedRole = resolveDashboardAccessRole({
      profileRole: fallbackProfile.role,
      appMetadata: user.app_metadata,
    });

    return {
      userId: user.id,
      email: user.email ?? null,
      profile: fallbackProfile,
      role: resolvedRole,
      canEdit: false,
    };
  }

  profile = (profileQuery.data as ProfileRow | null) ?? null;

  if (!profile) {
    const insert = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        full_name:
          (user.user_metadata?.full_name as string | undefined) ??
          (user.email?.split("@")[0] ?? "Usuario"),
      })
      .select("*")
      .single();

    if (insert.error) {
      console.error("[auth] failed to create profile", insert.error);
      profile = fallbackProfile;
    } else {
      profile = insert.data as ProfileRow;
    }
  }

  const resolvedRole = resolveDashboardAccessRole({
    profileRole: profile.role,
    appMetadata: user.app_metadata,
  });

  return {
    userId: user.id,
    email: user.email ?? null,
    profile,
    role: resolvedRole,
    canEdit:
      resolvedRole === "admin" ||
      resolvedRole === "editor" ||
      resolvedRole === "coordinator" ||
      resolvedRole === "collaborator",
  };
}

export async function requireUserContext() {
  const context = await getUserContext();

  if (!context.userId) {
    redirect("/login");
  }

  return context;
}

export async function requireEditor() {
  const context = await requireUserContext();

  if (!context.canEdit) {
    throw new Error("No tenes permisos para editar.");
  }

  return context;
}
