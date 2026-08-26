import { describe, expect, it } from "vitest";

import { resolveApprovalTarget } from "@/lib/access-requests/approval";

const ana = { id: "person-ana", fullName: "Ana Pérez", email: "ana@basquetpass.tv" };
const anaSinCorreo = { id: "person-ana-2", fullName: "Ana Perez", email: null };
const otro = { id: "person-otro", fullName: "Juan López", email: "juan@basquetpass.tv" };

describe("resolveApprovalTarget", () => {
  it("links to the person whose email matches exactly", () => {
    const target = resolveApprovalTarget({
      email: "ana@basquetpass.tv",
      fullName: "Ana Pérez",
      candidates: [otro, ana],
    });

    expect(target.kind).toBe("link");
    expect(target.kind === "link" && target.person.id).toBe("person-ana");
  });

  it("matches the email case-insensitively and ignores surrounding space", () => {
    const target = resolveApprovalTarget({
      email: "  ANA@Basquetpass.TV ",
      fullName: "Ana Pérez",
      candidates: [ana],
    });

    expect(target.kind).toBe("link");
  });

  it("never creates when an email matches, even if a name matches another row", () => {
    const target = resolveApprovalTarget({
      email: "ana@basquetpass.tv",
      fullName: "Juan López",
      candidates: [ana, otro],
    });

    expect(target.kind).toBe("link");
    expect(target.kind === "link" && target.person.id).toBe("person-ana");
  });

  it("suggests name matches when no email matches, ignoring accents and case", () => {
    const target = resolveApprovalTarget({
      email: "ana.perez@gmail.com",
      fullName: "ANA PEREZ",
      candidates: [otro, anaSinCorreo],
    });

    expect(target.kind).toBe("suggest");
    expect(target.kind === "suggest" && target.suggestions.map((s) => s.id)).toEqual([
      "person-ana-2",
    ]);
  });

  it("suggests a person whose name contains every token of the requested name", () => {
    const target = resolveApprovalTarget({
      email: "nuevo@gmail.com",
      fullName: "Ana Perez",
      candidates: [{ id: "p3", fullName: "Ana Maria Perez", email: null }],
    });

    expect(target.kind).toBe("suggest");
  });

  it("does not suggest on a single shared token", () => {
    const target = resolveApprovalTarget({
      email: "nuevo@gmail.com",
      fullName: "Ana Gomez",
      candidates: [{ id: "p4", fullName: "Ana Maria Perez", email: null }],
    });

    expect(target.kind).toBe("create");
  });

  it("creates when nothing matches", () => {
    const target = resolveApprovalTarget({
      email: "nadie@gmail.com",
      fullName: "Persona Nueva",
      candidates: [ana, otro],
    });

    expect(target.kind).toBe("create");
  });

  it("creates when there are no candidates at all", () => {
    const target = resolveApprovalTarget({
      email: "nadie@gmail.com",
      fullName: "Persona Nueva",
      candidates: [],
    });

    expect(target.kind).toBe("create");
  });

  it("skips candidates already linked to another profile when matching by name", () => {
    const target = resolveApprovalTarget({
      email: "nueva@gmail.com",
      fullName: "Ana Perez",
      candidates: [{ ...anaSinCorreo, profileId: "otro-perfil" }],
    });

    expect(target.kind).toBe("create");
  });
});
