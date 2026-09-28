import { describe, expect, it } from "vitest";

import { launcherApps } from "@/lib/acceso/catalog";

// The apex launcher lists only the apps a person may enter: the portal by
// Cuenta, each sibling by a row in auth_effective_access.
describe("launcherApps", () => {
  it("lists the portal first and granted siblings in catalog order", () => {
    expect(
      launcherApps({ hasPortalAccess: true, apps: ["ops", "analytics"] }),
    ).toEqual(["portal", "analytics", "ops"]);
  });

  it("leaves out the portal for an identity without a Cuenta", () => {
    expect(
      launcherApps({ hasPortalAccess: false, apps: ["facturacion"] }),
    ).toEqual(["facturacion"]);
  });

  it("ignores the portal row and apps outside the sibling catalog", () => {
    expect(
      launcherApps({ hasPortalAccess: false, apps: ["portal", "unknown", "ops"] }),
    ).toEqual(["ops"]);
  });

  it("falls back to the portal when nothing admits the person, so they can ask for access", () => {
    expect(launcherApps({ hasPortalAccess: false, apps: [] })).toEqual([
      "portal",
    ]);
  });

  it("keeps the portal for a super admin without a Cuenta", () => {
    expect(
      launcherApps({
        hasPortalAccess: false,
        superAdmin: true,
        apps: ["portal", "analytics", "incidencias", "generator", "ops", "facturacion"],
      }),
    ).toEqual(["portal", "analytics", "incidencias", "generator", "ops", "facturacion"]);
  });
});
