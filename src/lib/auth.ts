import { cache } from "react";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/server";
import type { AppRole, ProfileRow } from "@/lib/database.types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type UserContext = Awaited<ReturnType<typeof getUserContext>>;

// Cross-request profile cache: profiles change rarely and only through the
// people actions (which call clearProfileCache on every mutation); the TTL
// bounds staleness from out-of-band edits (direct SQL). Null is cached too —
// but only after the first-login auto-link attempt has run — so unprovisioned
// sessions don't rescan unlinked profiles on every request. Assumes a single
// Node process (pm2 fork mode); revisit before clustering (ADR 0005).
const PROFILE_CACHE_TTL_MS = 30_000;
const profileCache = new Map<
  string,
  { profile: ProfileRow | null; expiresAt: number }
>();

export function clearProfileCache() {
  profileCache.clear();
}

async function resolveProfile(
  authUserId: string,
  email: string | null,
): Promise<ProfileRow | null> {
  const cached = profileCache.get(authUserId);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.profile;
  }

  const profile = await loadProfile(authUserId, email);
  profileCache.set(authUserId, {
    profile,
    expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
  });

  return profile;
}

export const getUserContext = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return {
      userId: null,
      profileId: null,
      email: null,
      profile: null,
      role: "viewer" as AppRole,
      canEdit: false,
      hasAccess: false,
    };
  }

  const authUserId = session.user.id;
  const email = session.user.email ?? null;
  const profile = await resolveProfile(authUserId, email);

  // Authenticated but unprovisioned: no access, routed to /no-access (D-11/D-13).
  if (!profile) {
    return {
      userId: authUserId,
      profileId: null,
      email,
      profile: null,
      role: "viewer" as AppRole,
      canEdit: false,
      hasAccess: false,
    };
  }

  const role: AppRole = profile.role ?? "viewer";

  return {
    userId: authUserId,
    // Domain actor id (uuid, FK target for created_by/changed_by/etc.). Distinct
    // from userId, which is the Better Auth text id post-cutover.
    profileId: profile.id,
    email,
    profile,
    role,
    canEdit:
      role === "admin" ||
      role === "editor" ||
      role === "coordinator" ||
      role === "collaborator",
    hasAccess: true,
  };
});

async function loadProfile(
  authUserId: string,
  email: string | null,
): Promise<ProfileRow | null> {
  const supabaseAdmin = createSupabaseAdminClient();

  let profile: ProfileRow | null = null;

  const byAuthId = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (byAuthId.error) {
    console.error("[auth] failed to load profile by auth_user_id", byAuthId.error);
  } else {
    profile = (byAuthId.data as ProfileRow | null) ?? null;
  }

  // First login: stamp auth_user_id onto the email-matched, still-unlinked row
  // (D-06). Match case-insensitively in JS over the small profiles set to avoid
  // SQL LIKE-wildcard false positives on emails containing `_`.
  if (!profile && email) {
    const normalizedEmail = email.toLowerCase();
    const unlinked = await supabaseAdmin
      .from("profiles")
      .select("*")
      .is("auth_user_id", null);

    if (unlinked.error) {
      console.error("[auth] failed to load unlinked profiles", unlinked.error);
    } else {
      const candidate = ((unlinked.data as ProfileRow[] | null) ?? []).find(
        (row) => row.email?.toLowerCase() === normalizedEmail,
      );

      if (candidate) {
        const link = await supabaseAdmin
          .from("profiles")
          .update({ auth_user_id: authUserId })
          .eq("id", candidate.id)
          .is("auth_user_id", null)
          .select("*")
          .maybeSingle();

        if (link.error) {
          console.error("[auth] failed to auto-link profile by email", link.error);
          profile = candidate;
        } else {
          profile = (link.data as ProfileRow | null) ?? candidate;
        }
      }
    }
  }

  return profile;
}

export async function requireUserContext() {
  const context = await getUserContext();

  if (!context.userId) {
    redirect("/login");
  }

  return context;
}

export async function requireAccess() {
  const context = await getUserContext();

  if (!context.userId) {
    redirect("/login");
  }

  if (!context.hasAccess) {
    redirect("/no-access");
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
