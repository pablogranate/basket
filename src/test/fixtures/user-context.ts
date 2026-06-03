import type { UserContext } from "@/lib/auth";
import type { AppRole, ProfileRow } from "@/lib/database.types";

type AuthedContext = Extract<UserContext, { userId: string }>;
type GuestContext = Extract<UserContext, { userId: null }>;

function buildProfile(userId: string, role: AppRole): ProfileRow {
  const now = new Date().toISOString();

  return {
    id: userId,
    full_name: "Editor de prueba",
    role,
    created_at: now,
    updated_at: now,
  };
}

export function makeUserContext(
  overrides: Partial<AuthedContext> = {},
): AuthedContext {
  const userId = overrides.userId ?? "user-test-1";
  const role: AppRole = overrides.role ?? "editor";

  return {
    userId,
    email: "editor@basket-app.test",
    profile: buildProfile(userId, role),
    role,
    canEdit: true,
    ...overrides,
  };
}

export function makeGuestContext(
  overrides: Partial<GuestContext> = {},
): GuestContext {
  return {
    userId: null,
    email: null,
    profile: null,
    role: "viewer",
    canEdit: false,
    ...overrides,
  };
}
