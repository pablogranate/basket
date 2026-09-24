import { describe, expect, it } from "vitest";

import {
  accesoLevelLabel,
  accesoLevelOptions,
  launcherApps,
} from "@/lib/acceso/catalog";

// What the Accesos matrix offers per sibling app. Each app decides what its
// Niveles mean, so the labels are per app; the stored values never change.
describe("accesoLevelOptions", () => {
  it("offers facturacion only Coordinador (write) and Admin (admin) — read does not apply", () => {
    expect(accesoLevelOptions("facturacion")).toEqual([
      { level: "write", label: "Coordinador" },
      { level: "admin", label: "Admin" },
    ]);
  });

  it("keeps Lectura / Escritura / Admin for the other sibling apps", () => {
    for (const app of ["analytics", "incidencias", "generator", "ops"] as const) {
      expect(accesoLevelOptions(app)).toEqual([
        { level: "read", label: "Lectura" },
        { level: "write", label: "Escritura" },
        { level: "admin", label: "Admin" },
      ]);
    }
  });
});

describe("accesoLevelLabel", () => {
  it("labels a Nivel in the app's own words", () => {
    expect(accesoLevelLabel("facturacion", "write")).toBe("Coordinador");
    expect(accesoLevelLabel("facturacion", "admin")).toBe("Admin");
    expect(accesoLevelLabel("ops", "write")).toBe("Escritura");
  });

  it("still labels a facturacion=read row instead of failing, marked as not applicable", () => {
    expect(accesoLevelLabel("facturacion", "read")).toBe("Lectura (no aplica)");
  });
});

// The apex launcher lists only the apps a person may enter: the portal by
// Cuenta, each sibling by an Acceso whose Nivel that app actually uses.
describe("launcherApps", () => {
  it("lists the portal first and granted siblings in catalog order", () => {
    expect(
      launcherApps({
        hasPortalAccess: true,
        accesos: [
          { app: "ops", level: "read" },
          { app: "analytics", level: "write" },
        ],
      }),
    ).toEqual(["portal", "analytics", "ops"]);
  });

  it("leaves out the portal for an identity without a Cuenta", () => {
    expect(
      launcherApps({
        hasPortalAccess: false,
        accesos: [{ app: "facturacion", level: "write" }],
      }),
    ).toEqual(["facturacion"]);
  });

  it("hides facturacion for a read-only Acceso, which facturacion ignores", () => {
    expect(
      launcherApps({
        hasPortalAccess: true,
        accesos: [{ app: "facturacion", level: "read" }],
      }),
    ).toEqual(["portal"]);
  });

  it("falls back to the portal when nothing admits the person, so they can ask for access", () => {
    expect(launcherApps({ hasPortalAccess: false, accesos: [] })).toEqual([
      "portal",
    ]);
    expect(
      launcherApps({
        hasPortalAccess: false,
        accesos: [{ app: "facturacion", level: "read" }],
      }),
    ).toEqual(["portal"]);
  });
});
