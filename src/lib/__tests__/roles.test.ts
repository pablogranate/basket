import { describe, expect, it } from "vitest";

import type { AppRole } from "@/lib/database.types";
import {
  ACCESS_TIER_OPTIONS,
  APP_ROLES,
  can,
  canGrantTier,
  isAppRole,
  normalizeAccessTier,
  type Capability,
} from "@/lib/roles";

// Written out by hand on purpose: adding a role or a capability must force an
// explicit yes/no here rather than inherit one from the module under test.
const MATRIX: Record<AppRole, Record<Capability, boolean>> = {
  admin: {
    "dashboard.full": true,
    edit: true,
    "access.manage": true,
    "access.approve": true,
    admin: true,
  },
  editor: {
    "dashboard.full": true,
    edit: true,
    "access.manage": true,
    "access.approve": true,
    admin: false,
  },
  collaborator: {
    "dashboard.full": false,
    edit: true,
    "access.manage": false,
    "access.approve": false,
    admin: false,
  },
};

const CAPABILITIES = Object.keys(MATRIX.admin) as Capability[];

function actor(role: AppRole, hasAccess = true) {
  return { role, hasAccess };
}

describe("role capability matrix", () => {
  it("covers every role in the catalog", () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...APP_ROLES].sort());
  });

  describe.each(APP_ROLES)("%s", (role) => {
    it.each(CAPABILITIES)("%s", (capability) => {
      expect(can(actor(role), capability)).toBe(MATRIX[role][capability]);
    });
  });

  it("denies everything to a context without access, whatever its role", () => {
    for (const role of APP_ROLES) {
      for (const capability of CAPABILITIES) {
        expect(can(actor(role, false), capability)).toBe(false);
      }
    }
  });

  it("denies everything to a missing actor", () => {
    for (const capability of CAPABILITIES) {
      expect(can(null, capability)).toBe(false);
      expect(can(undefined, capability)).toBe(false);
    }
  });
});

describe("canGrantTier (issue #30 — which tiers a manager may grant/revoke)", () => {
  const GRANT_MATRIX: Record<AppRole, Record<AppRole, boolean>> = {
    admin: { admin: true, editor: true, collaborator: true },
    editor: { admin: false, editor: false, collaborator: true },
    collaborator: { admin: false, editor: false, collaborator: false },
  };

  describe.each(APP_ROLES)("%s grants", (manager) => {
    it.each(APP_ROLES)("%s", (tier) => {
      expect(canGrantTier(actor(manager), tier)).toBe(
        GRANT_MATRIX[manager][tier],
      );
    });
  });

  it("denies an admin without access", () => {
    expect(canGrantTier(actor("admin", false), "collaborator")).toBe(false);
  });
});

describe("tier vocabulary", () => {
  it("offers exactly the catalog roles as options, least privileged first", () => {
    expect(ACCESS_TIER_OPTIONS.map((option) => option.value)).toEqual([
      "collaborator",
      "editor",
      "admin",
    ]);
    expect(ACCESS_TIER_OPTIONS.map((option) => option.label)).toEqual([
      "Externo",
      "Productor",
      "Admin",
    ]);
  });

  it("normalizes case and whitespace, falls back to Externo", () => {
    expect(normalizeAccessTier(" Admin ")).toBe("admin");
    expect(normalizeAccessTier("EDITOR")).toBe("editor");
    expect(normalizeAccessTier("coordinator")).toBe("collaborator");
    expect(normalizeAccessTier("viewer")).toBe("collaborator");
    expect(normalizeAccessTier("")).toBe("collaborator");
  });

  it("recognizes only catalog roles", () => {
    expect(isAppRole("admin")).toBe(true);
    expect(isAppRole("coordinator")).toBe(false);
    expect(isAppRole(null)).toBe(false);
  });
});
