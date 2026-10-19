import { describe, expect, it } from "vitest";

import {
  findExistingAccount,
  findMergeSuggestions,
  resolveApprovalTarget,
} from "@/lib/access-requests/approval";

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

describe("findExistingAccount", () => {
  const conCuenta = {
    id: "person-martin",
    fullName: "Martín Gómez",
    email: "martin.gomez@basquetpass.tv",
    profileId: "profile-martin",
    phone: "+541155550101",
  };

  it("flags a ficha with a Cuenta that shares the phone in another format, and the name", () => {
    const match = findExistingAccount({
      email: "martin.personal@gmail.com",
      fullName: "Martin Gomez",
      phone: "+5491155550101",
      candidates: [otro, conCuenta],
    });

    expect(match).toEqual({ person: conCuenta, reasons: ["phone", "name"] });
  });

  it("flags by a legacy-formatted phone alone", () => {
    const match = findExistingAccount({
      email: "otro.mail@gmail.com",
      fullName: "Laureano Gonzalez",
      phone: "+542996239091",
      candidates: [{ ...conCuenta, fullName: "David Posca", phone: "54 9 2996 23-9091" }],
    });

    expect(match?.reasons).toEqual(["phone"]);
  });

  it("flags by a name contained in the longer one", () => {
    const match = findExistingAccount({
      email: "nuevo@gmail.com",
      fullName: "Laureano David Gonzalez Posca",
      phone: "+541100000000",
      candidates: [{ ...conCuenta, fullName: "David Posca" }],
    });

    expect(match?.reasons).toEqual(["name"]);
  });

  it("ignores fichas without a Cuenta, the applicant's own email, and a lone first name", () => {
    expect(
      findExistingAccount({
        email: "martin.gomez@basquetpass.tv",
        fullName: "Martín Gómez",
        phone: "+541155550101",
        candidates: [conCuenta, { ...conCuenta, id: "p2", profileId: null }],
      }),
    ).toBeNull();
    expect(
      findExistingAccount({
        email: "x@gmail.com",
        fullName: "Martín",
        phone: null,
        candidates: [conCuenta],
      }),
    ).toBeNull();
  });

  it("prefers the candidate matching on both signals", () => {
    const soloNombre = { ...conCuenta, id: "p-name", phone: "+541199999999" };
    const match = findExistingAccount({
      email: "x@gmail.com",
      fullName: "Martín Gómez",
      phone: "+5491155550101",
      candidates: [soloNombre, conCuenta],
    });

    expect(match?.person.id).toBe("person-martin");
  });
});

describe("findMergeSuggestions", () => {
  const linked = { id: "nino", fullName: "Nino Tolaba", email: "nino@gmail.com", profileId: null };
  const grilla = { id: "rene", fullName: "Rene Nino Tolaba", email: null, profileId: null };
  const conCuenta = { id: "otro", fullName: "Nino Tolaba", email: null, profileId: "cuenta" };

  it("offers look-alike fichas without a cuenta even when the email linked one, never that one", () => {
    expect(
      findMergeSuggestions({
        names: ["Nino Tolaba"],
        candidates: [linked, grilla, conCuenta],
        excludeId: "nino",
      }).map((s) => s.id),
    ).toEqual(["rene"]);
  });

  it("matches any of the names: the declared one or the linked ficha's", () => {
    expect(
      findMergeSuggestions({
        names: ["N. Tolaba", "Nino Tolaba"],
        candidates: [grilla],
      }).map((s) => s.id),
    ).toEqual(["rene"]);
  });
});
