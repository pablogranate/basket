import { describe, expect, it } from "vitest";

import { directoryLinkFor, launcherApps } from "@/lib/acceso/catalog";

// basket#202: "Volver" / "Elegir aplicación" only when there is a choice.
describe("directoryLinkFor", () => {
  const apexUrl = "https://basket-app.com";

  it("links to the directory for two apps or more", () => {
    expect(directoryLinkFor({ apps: ["portal", "facturacion"], apexUrl })).toBe(apexUrl);
    expect(
      directoryLinkFor({ apps: ["portal", "analytics", "ops"], apexUrl }),
    ).toBe(apexUrl);
  });

  it("hides it with one app or none", () => {
    expect(directoryLinkFor({ apps: ["portal"], apexUrl })).toBeNull();
    expect(directoryLinkFor({ apps: [], apexUrl })).toBeNull();
  });

  it("hides it off the basket-app hosts, where there is no apex", () => {
    expect(directoryLinkFor({ apps: ["portal", "facturacion"], apexUrl: null })).toBeNull();
  });
});

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

  // basket#199: no fallback; the apex sends an empty list to the Solicitud form.
  it("lists nothing when nothing admits the person", () => {
    expect(launcherApps({ hasPortalAccess: false, apps: [] })).toEqual([]);
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
