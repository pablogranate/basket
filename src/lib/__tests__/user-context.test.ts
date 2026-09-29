import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProfileRow } from "@/lib/database.types";

// getUserContext resolves the Cuenta from the Domain DB and the portal role
// from auth_effective_access (ADR 0010); the portal Acceso alone decides
// access (basket#189).
const { state, getSession, getPortalAccess, insertValues } = vi.hoisted(() => ({
  state: {
    byAuthId: [] as unknown[],
    unlinked: [] as unknown[],
    linked: [] as unknown[],
    created: [] as unknown[],
  },
  getSession: vi.fn(),
  getPortalAccess: vi.fn(),
  insertValues: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

vi.mock("@/lib/auth/server", () => ({ auth: { api: { getSession } } }));

vi.mock("@/lib/acceso/portal", () => ({ getPortalAccess }));

// select().from().where() is awaited directly for the unlinked scan and via
// .limit(1) for the auth_user_id lookup; update().set().where().returning()
// stamps the link; insert().values().onConflictDoNothing().returning()
// creates a super admin's Cuenta.
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
    insert: () => ({
      values: (values: unknown) => {
        insertValues(values);
        return { onConflictDoNothing: () => ({ returning: async () => state.created }) };
      },
    }),
  },
}));

import { clearProfileCache, getUserContext } from "@/lib/auth";

const AUTH_USER_ID = "auth-user-1";

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "profile-1",
    full_name: "Ana",
    email: "ana@basquetpass.tv",
    auth_user_id: AUTH_USER_ID,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function signIn(email = "ana@basquetpass.tv", name = "Ana") {
  getSession.mockResolvedValue({ user: { id: AUTH_USER_ID, email, name } });
}

const DENIED = { userId: AUTH_USER_ID, profileId: null, hasAccess: false };

describe("getUserContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProfileCache();
    state.byAuthId = [];
    state.unlinked = [];
    state.linked = [];
    state.created = [];
  });

  it("is a guest without a session", async () => {
    getSession.mockResolvedValue(null);

    expect(await getUserContext()).toMatchObject({
      userId: null,
      hasAccess: false,
      superAdmin: false,
    });
  });

  it("takes the role from the portal Acceso", async () => {
    signIn();
    state.byAuthId = [profile()];
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
    state.byAuthId = [profile()];
    getPortalAccess.mockResolvedValue({ role: "admin", superAdmin: true });

    expect(await getUserContext()).toMatchObject({
      role: "admin",
      superAdmin: true,
      hasAccess: true,
    });
  });

  it("denies a Cuenta whose identity holds no portal Acceso", async () => {
    signIn();
    state.byAuthId = [profile()];
    getPortalAccess.mockResolvedValue(null);

    expect(await getUserContext()).toMatchObject(DENIED);
  });

  it("denies access when the Auth DB read fails", async () => {
    signIn();
    state.byAuthId = [profile()];
    getPortalAccess.mockRejectedValue(new Error("auth db down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await getUserContext()).toMatchObject(DENIED);
    consoleError.mockRestore();
  });

  it("denies an identity with a portal Acceso but no Cuenta", async () => {
    signIn("nobody@gmail.com");
    getPortalAccess.mockResolvedValue({ role: "editor", superAdmin: false });

    expect(await getUserContext()).toMatchObject(DENIED);
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("creates the Cuenta of a super admin who has none", async () => {
    signIn("Boss@gmail.com", "Boss");
    getPortalAccess.mockResolvedValue({ role: "admin", superAdmin: true });
    state.created = [profile({ id: "profile-new", email: "boss@gmail.com", full_name: "Boss" })];
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});

    const context = await getUserContext();

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "boss@gmail.com",
        fullName: "Boss",
        authUserId: AUTH_USER_ID,
      }),
    );
    expect(context).toMatchObject({
      profileId: "profile-new",
      role: "admin",
      superAdmin: true,
      hasAccess: true,
    });
    consoleInfo.mockRestore();
  });

  it("re-reads the portal role on every request despite the profile cache", async () => {
    signIn();
    state.byAuthId = [profile()];
    getPortalAccess.mockResolvedValueOnce({ role: "editor", superAdmin: false });
    getPortalAccess.mockResolvedValueOnce({ role: "collaborator", superAdmin: false });

    expect((await getUserContext()).role).toBe("editor");
    expect((await getUserContext()).role).toBe("collaborator");
  });

  it("links an unlinked Cuenta by email at first login, granting nothing", async () => {
    signIn("Ana@Basquetpass.tv");
    const unlinked = profile({ auth_user_id: null });
    state.unlinked = [unlinked];
    state.linked = [{ ...unlinked, auth_user_id: AUTH_USER_ID }];
    getPortalAccess.mockResolvedValue({ role: "editor", superAdmin: false });

    const context = await getUserContext();

    expect(context).toMatchObject({ profileId: "profile-1", role: "editor", hasAccess: true });
    expect(insertValues).not.toHaveBeenCalled();
  });
});
