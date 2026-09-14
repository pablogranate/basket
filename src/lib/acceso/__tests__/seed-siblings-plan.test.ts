import { describe, expect, it } from "vitest";

import { planSiblingAccesos } from "@/lib/acceso/seed-siblings-plan";

// Spec #172 story 27: same effective rights as in Supabase / the allowlist.
describe("planSiblingAccesos", () => {
  it("maps incidencias operador → escritura and admin → admin", () => {
    const plan = planSiblingAccesos({
      incidencias: [
        { email: "Op@basquetpass.tv", role: "operador" },
        { email: "boss@basquetpass.tv", role: "admin" },
      ],
      ops: [],
      opsViewerEmails: [],
      analytics: [],
    });

    expect(plan).toEqual([
      { email: "op@basquetpass.tv", app: "incidencias", level: "write" },
      { email: "boss@basquetpass.tv", app: "incidencias", level: "admin" },
    ]);
  });

  it("maps ops viewer-only emails → lectura and every other ops user → escritura", () => {
    const plan = planSiblingAccesos({
      incidencias: [],
      ops: [{ email: "viewer@gmail.com" }, { email: "ops@basquetpass.tv" }],
      opsViewerEmails: ["VIEWER@gmail.com"],
      analytics: [],
    });

    expect(plan).toEqual([
      { email: "viewer@gmail.com", app: "ops", level: "read" },
      { email: "ops@basquetpass.tv", app: "ops", level: "write" },
    ]);
  });

  it("maps analytics allowlist admin → admin and viewer → lectura", () => {
    const plan = planSiblingAccesos({
      incidencias: [],
      ops: [],
      opsViewerEmails: [],
      analytics: [
        { email: "a@basquetpass.tv", role: "admin" },
        { email: "v@basquetpass.tv", role: "viewer" },
      ],
    });

    expect(plan).toEqual([
      { email: "a@basquetpass.tv", app: "analytics", level: "admin" },
      { email: "v@basquetpass.tv", app: "analytics", level: "read" },
    ]);
  });

  it("skips unknown roles and blank emails, and keeps one entry per email and app", () => {
    const plan = planSiblingAccesos({
      incidencias: [
        { email: "x@basquetpass.tv", role: "invitado" },
        { email: "", role: "operador" },
        { email: "dup@basquetpass.tv", role: "operador" },
        { email: "DUP@basquetpass.tv", role: "admin" },
      ],
      ops: [],
      opsViewerEmails: [],
      analytics: [{ email: "y@basquetpass.tv", role: "owner" }],
    });

    // Later rows win on duplicates so a stricter Nivel listed later is kept.
    expect(plan).toEqual([
      { email: "dup@basquetpass.tv", app: "incidencias", level: "admin" },
    ]);
  });
});
