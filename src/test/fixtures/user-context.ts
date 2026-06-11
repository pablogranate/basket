import type { UserContext } from "@/lib/auth";
import type { AppRole, ProfileRow } from "@/lib/database.types";

type AuthedContext = Extract<UserContext, { userId: string }>;
type GuestContext = Extract<UserContext, { userId: null }>;

function buildProfile(
  profileId: string,
  authUserId: string,
  role: AppRole,
): ProfileRow {
  const now = new Date().toISOString();

  return {
    id: profileId,
    full_name: "Editor de prueba",
    role,
    email: "editor@basket-app.test",
    auth_user_id: authUserId,
    created_at: now,
    updated_at: now,
  };
}

export function makeUserContext(
  overrides: Partial<AuthedContext> = {},
): AuthedContext {
  // userId is the Better Auth (text) id; profileId is the domain actor uuid.
  // Distinct by default so tests catch any code that conflates them.
  const userId = overrides.userId ?? "user-test-1";
  const profileId = overrides.profileId ?? "profile-test-1";
  const role: AppRole = overrides.role ?? "editor";

  return {
    email: "editor@basket-app.test",
    canEdit: true,
    ...overrides,
    userId,
    profileId,
    profile: overrides.profile ?? buildProfile(profileId, userId, role),
    role,
    hasAccess: true,
  };
}

export function makeGuestContext(
  overrides: Partial<GuestContext> = {},
): GuestContext {
  return {
    userId: null,
    profileId: null,
    email: null,
    profile: null,
    role: "viewer",
    canEdit: false,
    hasAccess: false,
    ...overrides,
  };
}
