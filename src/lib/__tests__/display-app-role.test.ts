import { describe, expect, it } from "vitest";

import type { AppRole } from "@/lib/database.types";
import { APP_ROLE_DISPLAY_NAMES, getAppRoleDisplayName } from "@/lib/display";

describe("getAppRoleDisplayName (three-role display labels)", () => {
  const cases: Array<[AppRole, string]> = [
    ["admin", "Admin"],
    ["editor", "Productor"],
    ["collaborator", "Externo"],
    ["coordinator", "Productor"],
    ["viewer", "Externo"],
  ];

  it.each(cases)("renders %s as %s", (role, label) => {
    expect(getAppRoleDisplayName(role)).toBe(label);
    expect(APP_ROLE_DISPLAY_NAMES[role]).toBe(label);
  });

  it("folds legacy coordinator and viewer into the three-role vocabulary", () => {
    expect(getAppRoleDisplayName("coordinator")).toBe("Productor");
    expect(getAppRoleDisplayName("viewer")).toBe("Externo");
  });

  it("never leaks a raw enum value to the UI", () => {
    const allowed = new Set(["Admin", "Productor", "Externo"]);
    for (const role of Object.keys(APP_ROLE_DISPLAY_NAMES) as AppRole[]) {
      expect(allowed.has(getAppRoleDisplayName(role))).toBe(true);
    }
  });

  it("falls back to Externo when no role is provided", () => {
    expect(getAppRoleDisplayName(null)).toBe("Externo");
    expect(getAppRoleDisplayName(undefined)).toBe("Externo");
  });
});
