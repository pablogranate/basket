import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeUserContext } from "@/test/fixtures/user-context";

// The loaders read the domain DB through Drizzle now. Mock the client with a
// chainable stub whose terminal `.limit()` resolves the rows the SQL would
// return (email filtering lives in SQL, so each case sets the expected result).
const h = vi.hoisted(() => ({
  state: {
    rows: [] as unknown[],
    throwOnQuery: false,
    selectSpy: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: (...args: unknown[]) => {
      h.state.selectSpy(...args);
      const chain = {
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: async () => {
          if (h.state.throwOnQuery) throw new Error("boom");
          return h.state.rows;
        },
      };
      return chain;
    },
  },
}));

import {
  clearAnnouncementCache,
  getActiveAnnouncement,
} from "@/lib/data/announcements";
import { personHasPlatformAccess } from "@/lib/data/platform-access";

describe("data loaders accept a typed ctx (D-06)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    h.state.rows = [];
    h.state.throwOnQuery = false;
    clearAnnouncementCache();
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
    h.state.rows = [announcement];

    const result = await getActiveAnnouncement(makeUserContext());

    expect(h.state.selectSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual(announcement);
  });

  it("getActiveAnnouncement is unit-testable without cookies and returns null on error", async () => {
    h.state.throwOnQuery = true;

    const result = await getActiveAnnouncement(makeUserContext());

    expect(result).toBeNull();
  });
});

describe("personHasPlatformAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.state.rows = [];
    h.state.throwOnQuery = false;
  });

  it("returns false when email is empty", async () => {
    const result = await personHasPlatformAccess(null);
    expect(result).toBe(false);
    expect(h.state.selectSpy).not.toHaveBeenCalled();
  });

  it.each(["admin", "editor", "collaborator"])(
    "returns true for an access-granting role: %s",
    async (role) => {
      // The ilike + limit(1) filter runs in SQL; the DB would return the match.
      h.state.rows = [{ email: "grant@basket-app.test", role }];

      const result = await personHasPlatformAccess("Grant@Basket-App.test");

      expect(result).toBe(true);
      expect(h.state.selectSpy).toHaveBeenCalledTimes(1);
    },
  );

  it("returns false when there is no matching profile", async () => {
    h.state.rows = [];

    const result = await personHasPlatformAccess("missing@basket-app.test");

    expect(result).toBe(false);
  });

  it("returns false for a non-access-granting role (viewer)", async () => {
    h.state.rows = [{ email: "viewer@basket-app.test", role: "viewer" }];

    const result = await personHasPlatformAccess("viewer@basket-app.test");

    expect(result).toBe(false);
  });
});
