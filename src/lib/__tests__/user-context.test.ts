import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProfileRow } from "@/lib/database.types";

// getUserContext resolves the Cuenta from the Domain DB and the portal role
// from auth_effective_access (basket#186, ADR 0010).
const { state, getSession, getPortalAccess, grantPortalRoleIfAbsent } =
  vi.hoisted(() => ({
    state: {
      byAuthId: [] as unknown[],
      unlinked: [] as unknown[],
      linked: [] as unknown[],
    },
    getSession: vi.fn(),
    getPortalAccess: vi.fn(),
    grantPortalRoleIfAbsent: vi.fn(),
  }));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

vi.mock("@/lib/auth/server", () => ({ auth: { api: { getSession } } }));

vi.mock("@/lib/acceso/portal", () => ({
  getPortalAccess,
  grantPortalRoleIfAbsent,
}));

// select().from().where() is awaited directly for the unlinked scan and via
// .limit(1) for the auth_user_id lookup; update().set().where().returning()
// stamps the link.
vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => state.byAuthId,
          then: (resolve: (rows: unknown[]) => unknown) =>
            resolve(state.unlinked),
        }),
      }),
    }),
    update: () => ({
      set: () => ({ where: () => ({ returning: async () => state.linked }) }),
    }),
  },
}));

import { clearProfileCache, getUserContext } from "@/lib/auth";

const AUTH_USER_ID = "auth-user-1";

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "profile-1",
    full_name: "Ana",
    role: "collaborator",
    email: "ana@basquetpass.tv",
    auth_user_id: AUTH_USER_ID,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function signIn(email = "ana@basquetpass.tv") {
  getSession.mockResolvedValue({ user: { id: AUTH_USER_ID, email } });
}

describe("getUserContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProfileCache();
    state.byAuthId = [];
    state.unlinked = [];
    state.linked = [];
  });

  it("is a guest without a session", async () => {
    getSession.mockResolvedValue(null);

    expect(await getUserContext()).toMatchObject({
      userId: null,
      hasAccess: false,
      superAdmin: false,
    });
  });

  it("takes the role from the portal Acceso, not profiles.role", async () => {
    signIn();
    state.byAuthId = [profile({ role: "collaborator" })];
    getPortalAccess.mockResolvedValue({ role: "editor", superAdmin: false });

    const context = await getUserContext();

    expect(getPortalAccess).toHaveBeenCalledWith(AUTH_USER_ID);
    expect(context).toMatchObject({
      userId: AUTH_USER_ID,
      profileId: "profile-1",
      role: "editor",
      superAdmin: false,
      canEdit: true,
      hasAccess: true,
    });
  });

  it("resolves a super admin to admin", async () => {
    signIn();
    state.byAuthId = [profile({ role: "collaborator" })];
    getPortalAccess.mockResolvedValue({ role: "admin", superAdmin: true });

    expect(await getUserContext()).toMatchObject({
      role: "admin",
      superAdmin: true,
      hasAccess: true,
    });
  });

  it("falls back to profiles.role while the Cuenta has no portal row yet", async () => {
    signIn();
    state.byAuthId = [profile({ role: "admin" })];
    getPortalAccess.mockResolvedValue(null);

    expect(await getUserContext()).toMatchObject({
      role: "admin",
      superAdmin: false,
      hasAccess: true,
    });
  });

  it("falls back to profiles.role when the Auth DB read fails", async () => {
    signIn();
    state.byAuthId = [profile({ role: "editor" })];
    getPortalAccess.mockRejectedValue(new Error("auth db down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await getUserContext()).toMatchObject({
      role: "editor",
      hasAccess: true,
    });
    consoleError.mockRestore();
  });

  it("denies an identity with a portal Acceso but no Cuenta", async () => {
    signIn("nobody@gmail.com");
    getPortalAccess.mockResolvedValue({ role: "admin", superAdmin: true });

    expect(await getUserContext()).toMatchObject({
      userId: AUTH_USER_ID,
      profileId: null,
      hasAccess: false,
    });
  });

  it("re-reads the portal role on every request despite the profile cache", async () => {
    signIn();
    state.byAuthId = [profile()];
    getPortalAccess.mockResolvedValueOnce({ role: "editor", superAdmin: false });
    getPortalAccess.mockResolvedValueOnce({ role: "collaborator", superAdmin: false });

    expect((await getUserContext()).role).toBe("editor");
    expect((await getUserContext()).role).toBe("collaborator");
  });

  it("turns an unlinked Cuenta's profiles.role into a portal Acceso at first login", async () => {
    signIn("Ana@Basquetpass.tv");
    const unlinked = profile({ role: "editor", auth_user_id: null });
    state.unlinked = [unlinked];
    state.linked = [{ ...unlinked, auth_user_id: AUTH_USER_ID }];
    getPortalAccess.mockResolvedValue({ role: "editor", superAdmin: false });

    const context = await getUserContext();

    expect(grantPortalRoleIfAbsent).toHaveBeenCalledWith({
      userId: AUTH_USER_ID,
      role: "editor",
      grantedBy: null,
    });
    expect(context).toMatchObject({ role: "editor", hasAccess: true });
  });
});
