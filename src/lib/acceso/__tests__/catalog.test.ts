import { describe, expect, it } from "vitest";

import { accesoLevelLabel, accesoLevelOptions } from "@/lib/acceso/catalog";

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
