import { describe, expect, it } from "vitest";

import { requestAsksFuncion, resolveRequestApp } from "@/lib/acceso/catalog";
import {
  buildNoAccessPath,
  resolveNoAccessView,
} from "@/lib/access-requests/no-access";
import {
  checkAccessRequestFuncion,
  parseSubmitAccessRequest,
} from "@/lib/actions/parse/access-requests";

const CATALOG = ["portal", "analytics", "incidencias", "facturacion"];

// A Solicitud belongs to the app it came from (basket#198). The app arrives
// from a URL and a hidden field, so everything unknown becomes the portal.
describe("resolveRequestApp", () => {
  it("keeps an app the catalog knows, case-insensitively", () => {
    expect(resolveRequestApp("facturacion", CATALOG)).toBe("facturacion");
    expect(resolveRequestApp(" Facturacion ", CATALOG)).toBe("facturacion");
  });

  it("falls back to the portal for a missing or unknown app", () => {
    expect(resolveRequestApp(null, CATALOG)).toBe("portal");
    expect(resolveRequestApp("", CATALOG)).toBe("portal");
    expect(resolveRequestApp("evil", CATALOG)).toBe("portal");
  });
});

describe("resolveNoAccessView", () => {
  it("forwards someone who already holds the app", () => {
    expect(resolveNoAccessView({ holdsApp: true, pending: true })).toBe("forward");
    expect(resolveNoAccessView({ holdsApp: true, pending: false })).toBe("forward");
  });

  it("shows the summary for a pending Solicitud, the form otherwise", () => {
    expect(resolveNoAccessView({ holdsApp: false, pending: true })).toBe("pending");
    expect(resolveNoAccessView({ holdsApp: false, pending: false })).toBe("form");
  });

  it("keeps the app in the path", () => {
    expect(buildNoAccessPath("portal")).toBe("/no-access?app=portal");
    expect(buildNoAccessPath("facturacion")).toBe("/no-access?app=facturacion");
  });
});

describe("Función per app", () => {
  it("is asked only for the portal", () => {
    expect(requestAsksFuncion("portal")).toBe(true);
    expect(requestAsksFuncion("facturacion")).toBe(false);
  });

  it("is required for the portal", () => {
    expect(checkAccessRequestFuncion({ app: "portal", funcion: null })).toEqual({
      ok: false,
      error: "Elegí una función de la lista.",
    });
    expect(checkAccessRequestFuncion({ app: "portal", funcion: "Relator" })).toEqual({
      ok: true,
      funcion: "Relator",
    });
  });

  it("is never stored for another app, even when submitted", () => {
    expect(checkAccessRequestFuncion({ app: "facturacion", funcion: null })).toEqual({
      ok: true,
      funcion: null,
    });
    expect(
      checkAccessRequestFuncion({ app: "facturacion", funcion: "Relator" }),
    ).toEqual({ ok: true, funcion: null });
  });
});

function submitForm(entries: Record<string, string>) {
  const formData = new FormData();
  const values: Record<string, string> = {
    fullName: "Ana Pérez",
    phone: "+5491122334455",
    pais: "AR",
    ciudad: "Córdoba",
    ...entries,
  };
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

describe("parseSubmitAccessRequest", () => {
  it("accepts a form without Función and carries the app as submitted", () => {
    const result = parseSubmitAccessRequest(submitForm({ app: "facturacion" }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input).toMatchObject({ app: "facturacion", funcion: null });
    expect(result.input.ciudad).toBe("Córdoba, Argentina");
  });

  it("still rejects a Función outside the list", () => {
    expect(parseSubmitAccessRequest(submitForm({ funcion: "Presidente" }))).toEqual({
      ok: false,
      error: "Elegí una función de la lista.",
    });
  });

  it("still asks for Ciudad and phone for every app", () => {
    expect(
      parseSubmitAccessRequest(submitForm({ app: "facturacion", ciudad: "", pais: "" })).ok,
    ).toBe(false);
    expect(
      parseSubmitAccessRequest(submitForm({ app: "facturacion", phone: "123" })).ok,
    ).toBe(false);
  });
});
