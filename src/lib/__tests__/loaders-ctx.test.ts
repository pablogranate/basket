import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeUserContext } from "@/test/fixtures/user-context";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { getActiveAnnouncement } from "@/lib/data/announcements";
import { personHasPlatformAccess } from "@/lib/data/platform-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const mockedServerClient = vi.mocked(createSupabaseServerClient);
const mockedAdminClient = vi.mocked(createSupabaseAdminClient);

type StubResult = { data: unknown; error: unknown };

function makeAnnouncementQueryStub(result: StubResult) {
  const builder = {
    select: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
  };

  return {
    from: vi.fn(() => builder),
  };
}

describe("data loaders accept a typed ctx (D-06)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("getActiveAnnouncement runs with a fake ctx and returns the query shape", async () => {
    const announcement = {
      id: "a-1",
      title: "Aviso",
      body: "Cuerpo",
      active: true,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    const stub = makeAnnouncementQueryStub({ data: announcement, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedServerClient.mockResolvedValue(stub as any);

    const ctx = makeUserContext();
    const result = await getActiveAnnouncement(ctx);

    expect(mockedServerClient).toHaveBeenCalledTimes(1);
    expect(stub.from).toHaveBeenCalledWith("announcements");
    expect(result).toEqual(announcement);
  });

  it("getActiveAnnouncement is unit-testable without cookies and returns null on error", async () => {
    const stub = makeAnnouncementQueryStub({
      data: null,
      error: { message: "boom" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedServerClient.mockResolvedValue(stub as any);

    const result = await getActiveAnnouncement(makeUserContext());

    expect(result).toBeNull();
  });
});

describe("personHasPlatformAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeAdminStub(params: {
    users: Array<{ id: string; email: string; app_metadata?: unknown }>;
    profileRole: string | null;
  }) {
    const profileBuilder = {
      select: vi.fn(() => profileBuilder),
      eq: vi.fn(() => profileBuilder),
      maybeSingle: vi.fn(async () => ({
        data: params.profileRole ? { role: params.profileRole } : null,
        error: null,
      })),
    };

    return {
      auth: {
        admin: {
          listUsers: vi.fn(async () => ({
            data: { users: params.users },
            error: null,
          })),
        },
      },
      from: vi.fn(() => profileBuilder),
    };
  }

  it("returns false when email is empty", async () => {
    const result = await personHasPlatformAccess(null);
    expect(result).toBe(false);
    expect(mockedAdminClient).not.toHaveBeenCalled();
  });

  it("returns true for a person whose derived role is collaborator", async () => {
    const stub = makeAdminStub({
      users: [{ id: "u-1", email: "colab@basket-app.test" }],
      profileRole: "collaborator",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedAdminClient.mockReturnValue(stub as any);

    const result = await personHasPlatformAccess("Colab@Basket-App.test");

    expect(result).toBe(true);
    expect(stub.from).toHaveBeenCalledWith("profiles");
  });

  it("returns false when there is no matching auth user", async () => {
    const stub = makeAdminStub({
      users: [{ id: "u-2", email: "other@basket-app.test" }],
      profileRole: "collaborator",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedAdminClient.mockReturnValue(stub as any);

    const result = await personHasPlatformAccess("missing@basket-app.test");

    expect(result).toBe(false);
  });

  it("returns false when the derived role is not collaborator", async () => {
    const stub = makeAdminStub({
      users: [{ id: "u-3", email: "viewer@basket-app.test" }],
      profileRole: "viewer",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedAdminClient.mockReturnValue(stub as any);

    const result = await personHasPlatformAccess("viewer@basket-app.test");

    expect(result).toBe(false);
  });
});
