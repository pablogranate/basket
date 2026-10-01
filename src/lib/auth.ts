import { cache } from "react";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { and, eq, isNull } from "drizzle-orm";

import {
  getPortalAccess,
  PORTAL_APP,
  type PortalAccess,
} from "@/lib/acceso/portal";
import { buildNoAccessPath } from "@/lib/access-requests/no-access";
import { auth } from "@/lib/auth/server";
import type { AppRole, ProfileRow } from "@/lib/database.types";
import { db } from "@/lib/db/client";
import { profileColumns } from "@/lib/db/rows";
import { profiles as profilesTable } from "@/lib/db/schema";
import { can, CAPABILITY_DENIED_MESSAGE } from "@/lib/roles";

export type UserContext = Awaited<ReturnType<typeof getUserContext>>;

// Cross-request profile cache: the Cuenta only (the role is read per request
// from the Auth DB, see resolvePortalAccess). Profiles change rarely and only through the
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
      role: "collaborator" as AppRole,
      superAdmin: false,
      canEdit: false,
      hasAccess: false,
    };
  }

  const authUserId = session.user.id;
  const email = session.user.email ?? null;
  const [access, linkedProfile] = await Promise.all([
    resolvePortalAccess(authUserId),
    resolveProfile(authUserId, email),
  ]);
  // ADR 0010: a super admin is admin in the portal too, so the Cuenta domain
  // writes need is created on their first visit.
  const profile =
    linkedProfile ??
    (access?.superAdmin && email
      ? await createSuperAdminCuenta(authUserId, email, session.user.name)
      : null);

  // Authenticated but unprovisioned: no access, routed to /no-access
  // (D-11/D-13). Access is the portal Acceso; domain writes need the Cuenta's
  // uuid, so an identity missing either one is unprovisioned.
  if (!access || !profile) {
    return {
      userId: authUserId,
      profileId: null,
      email,
      profile: null,
      role: "collaborator" as AppRole,
      superAdmin: false,
      canEdit: false,
      hasAccess: false,
    };
  }

  const { role, superAdmin } = access;

  return {
    userId: authUserId,
    // Domain actor id (uuid, FK target for created_by/changed_by/etc.). Distinct
    // from userId, which is the Better Auth text id post-cutover.
    profileId: profile.id,
    email,
    profile,
    role,
    superAdmin,
    canEdit: can({ role, hasAccess: true }, "edit"),
    hasAccess: true,
  };
});

// The portal role comes from auth_effective_access (ADR 0010), uncached. The
// Auth DB being unreachable denies access: there is no second source.
async function resolvePortalAccess(
  authUserId: string,
): Promise<PortalAccess | null> {
  try {
    return await getPortalAccess(authUserId);
  } catch (error) {
    console.error("[auth] failed to load portal Acceso", error);
    return null;
  }
}

async function createSuperAdminCuenta(
  authUserId: string,
  email: string,
  name: string | null | undefined,
): Promise<ProfileRow | null> {
  try {
    const [created] = (await db
      .insert(profilesTable)
      .values({
        id: globalThis.crypto.randomUUID(),
        email: email.toLowerCase(),
        fullName: name || email.split("@")[0],
        authUserId,
      })
      // A parallel first request, or an unlinked Cuenta with the same email
      // created meanwhile, wins; the next request links or reads it.
      .onConflictDoNothing()
      .returning(profileColumns)) as ProfileRow[];

    if (created) {
      profileCache.set(authUserId, {
        profile: created,
        expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
      });
      console.info("[auth] created the Cuenta of a super admin", authUserId);
      return created;
    }
  } catch (error) {
    console.error("[auth] failed to create a super admin Cuenta", error);
  }

  profileCache.delete(authUserId);
  return loadProfile(authUserId, email);
}

async function loadProfile(
  authUserId: string,
  email: string | null,
): Promise<ProfileRow | null> {
  let profile: ProfileRow | null = null;

  try {
    const byAuthId = await db
      .select(profileColumns)
      .from(profilesTable)
      .where(eq(profilesTable.authUserId, authUserId))
      .limit(1);
    profile = (byAuthId[0] as ProfileRow | undefined) ?? null;
  } catch (error) {
    console.error("[auth] failed to load profile by auth_user_id", error);
  }

  // First login: stamp auth_user_id onto the email-matched, still-unlinked row
  // (D-06). Match case-insensitively in JS over the small profiles set to avoid
  // SQL LIKE-wildcard false positives on emails containing `_`.
  if (!profile && email) {
    const normalizedEmail = email.toLowerCase();

    try {
      const unlinked = (await db
        .select(profileColumns)
        .from(profilesTable)
        .where(isNull(profilesTable.authUserId))) as ProfileRow[];

      const candidate = unlinked.find(
        (row) => row.email?.toLowerCase() === normalizedEmail,
      );

      if (candidate) {
        try {
          const link = (await db
            .update(profilesTable)
            .set({ authUserId })
            // Guard against a concurrent link: only stamp a still-unlinked row.
            .where(
              and(
                eq(profilesTable.id, candidate.id),
                isNull(profilesTable.authUserId),
              ),
            )
            .returning(profileColumns)) as ProfileRow[];
          profile = link[0] ?? candidate;
        } catch (error) {
          console.error("[auth] failed to auto-link profile by email", error);
          profile = candidate;
        }
      }
    } catch (error) {
      console.error("[auth] failed to load unlinked profiles", error);
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
    redirect(buildNoAccessPath(PORTAL_APP));
  }

  return context;
}

export async function requireEditor() {
  const context = await requireUserContext();

  if (!context.canEdit) {
    throw new Error(CAPABILITY_DENIED_MESSAGE.edit);
  }

  return context;
}
