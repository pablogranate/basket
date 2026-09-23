import { describe, expect, it } from "vitest";

import { parseSetAcceso } from "@/lib/actions/parse/access";

function form(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

// One cell of the Accesos matrix: identity × sibling app → Nivel or none.
describe("parseSetAcceso", () => {
  it("accepts a sibling app and a Nivel", () => {
    expect(
      parseSetAcceso(form({ userId: " user-1 ", app: "incidencias", level: "write" })),
    ).toEqual({
      ok: true,
      input: { userId: "user-1", app: "incidencias", level: "write" },
    });
  });

  it("maps the 'none' option to a revoke (level null)", () => {
    expect(parseSetAcceso(form({ userId: "user-1", app: "ops", level: "none" }))).toEqual({
      ok: true,
      input: { userId: "user-1", app: "ops", level: null },
    });
  });

  it("rejects an app that is not a sibling — apps are added by migration, not by typo", () => {
    const result = parseSetAcceso(form({ userId: "user-1", app: "portal", level: "read" }));
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown Nivel and a missing identity", () => {
    expect(parseSetAcceso(form({ userId: "user-1", app: "ops", level: "owner" })).ok).toBe(false);
    expect(parseSetAcceso(form({ userId: "", app: "ops", level: "read" })).ok).toBe(false);
  });

  it("accepts facturacion coordinador (write) and admin, stored as the plain Nivel", () => {
    expect(
      parseSetAcceso(form({ userId: "user-1", app: "facturacion", level: "write" })),
    ).toEqual({ ok: true, input: { userId: "user-1", app: "facturacion", level: "write" } });
    expect(
      parseSetAcceso(form({ userId: "user-1", app: "facturacion", level: "admin" })),
    ).toEqual({ ok: true, input: { userId: "user-1", app: "facturacion", level: "admin" } });
  });

  it("rejects a Nivel the app does not offer — facturacion has no read", () => {
    const result = parseSetAcceso(form({ userId: "user-1", app: "facturacion", level: "read" }));
    expect(result.ok).toBe(false);
  });
});
