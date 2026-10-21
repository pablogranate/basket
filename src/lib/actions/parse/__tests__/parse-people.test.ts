import { describe, expect, it } from "vitest";

import {
  parseUpdatePersonAccessRole,
  parseUpsertPerson,
} from "@/lib/actions/parse/people";

function baseForm(entries: Record<string, string> = {}) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

describe("parseUpsertPerson", () => {
  it("stores the picked city as \"Ciudad, País\"", () => {
    const result = parseUpsertPerson(
      baseForm({ personId: "p", fullName: "Ana", pais: "AR", ciudad: "Córdoba" }),
    );

    expect(result.ok && result.input.payload.notes).toBe("Ciudad: Córdoba, Argentina");
  });

  it("stores a typed city with its country", () => {
    const result = parseUpsertPerson(
      baseForm({
        personId: "p",
        fullName: "Ana",
        pais: "AR",
        ciudad: "__otra__",
        otraCiudad: "Venado Tuerto",
      }),
    );

    expect(result.ok && result.input.payload.notes).toBe("Ciudad: Venado Tuerto, Argentina");
  });

  it("leaves the ficha without a city when none is picked", () => {
    const result = parseUpsertPerson(
      baseForm({ personId: "p", fullName: "Ana", pais: "AR", ciudad: "" }),
    );

    expect(result.ok && result.input.payload.notes).toBeNull();
  });

  it("refuses a city that is not in the picked country", () => {
    const result = parseUpsertPerson(
      baseForm({ personId: "p", fullName: "Ana", pais: "UY", ciudad: "Córdoba" }),
    );

    expect(result.ok).toBe(false);
  });

  it("extracts the payload, functions and team links", () => {
    const formData = baseForm({
      personId: "person-1",
      fullName: "  Ana Ruiz  ",
      phone: "+549112233",
      email: "ana@example.com",
      notes: "Trae su propia cámara",
    });
    formData.append("active", "on");
    formData.append("functions", "Camara");
    formData.append("functions", "Camara");
    formData.append("teamIds", " team-1 ");
    formData.append("teamIds", "team-2");

    const result = parseUpsertPerson(formData);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.personId).toBe("person-1");
    expect(result.input.payload.full_name).toBe("Ana Ruiz");
    expect(result.input.payload.phone).toBe("+549112233");
    expect(result.input.payload.active).toBe(true);
    // Dedupe + valid function keys only.
    expect(result.input.selectedFunctions).toEqual(["Camara"]);
    expect(result.input.selectedTeamIds).toEqual(["team-1", "team-2"]);
  });

  it("normalizes empties to null and drops invalid function keys", () => {
    const formData = baseForm({
      fullName: "Ana",
      phone: "   ",
      email: "",
    });
    formData.append("functions", "no-es-una-funcion");
    formData.append("teamIds", "   ");

    const result = parseUpsertPerson(formData);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.personId).toBe("");
    expect(result.input.payload.phone).toBeNull();
    expect(result.input.payload.email).toBeNull();
    expect(result.input.payload.notes).toBeNull();
    expect(result.input.selectedFunctions).toEqual([]);
    expect(result.input.selectedTeamIds).toEqual([]);
  });

  it("keeps the hidden-companion checkbox semantics (last value wins)", () => {
    const formData = baseForm({ fullName: "Ana" });
    formData.append("active", "off");

    const result = parseUpsertPerson(formData);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.payload.active).toBe(false);
  });
});

describe("parseUpdatePersonAccessRole", () => {
  it("normalizes a known tier", () => {
    const result = parseUpdatePersonAccessRole(
      baseForm({ personId: " person-1 ", accessRole: " Admin " }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.personId).toBe("person-1");
    expect(result.input.requestedAccessRole).toBe("admin");
  });

  it("falls back to collaborator for an unknown tier", () => {
    const result = parseUpdatePersonAccessRole(
      baseForm({ personId: "person-1", accessRole: "superuser" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.requestedAccessRole).toBe("collaborator");
  });
});
