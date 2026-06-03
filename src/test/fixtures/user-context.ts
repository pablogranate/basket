import type { UserContext } from "@/lib/auth";
import type { ProfileRow } from "@/lib/database.types";

function buildProfile(userId: string): ProfileRow {
  const now = new Date().toISOString();

  return {
    id: userId,
    full_name: "Editor de prueba",
    role: "editor",
    created_at: now,
    updated_at: now,
  };
}

export function makeUserContext(
  overrides: Partial<UserContext> = {},
): UserContext {
  const userId = overrides.userId ?? "user-test-1";

  return {
    userId,
    email: "editor@basket-app.test",
    profile: userId ? buildProfile(userId) : null,
    role: "editor",
    canEdit: true,
    ...overrides,
  };
}

export function makeGuestContext(
  overrides: Partial<UserContext> = {},
): UserContext {
  return makeUserContext({
    userId: null,
    email: null,
    profile: null,
    role: "viewer",
    canEdit: false,
    ...overrides,
  });
}
