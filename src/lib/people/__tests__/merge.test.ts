import { describe, expect, it } from "vitest";

import { findDuplicateFichas, groupMergeOptions, planFichaMerge } from "@/lib/people/merge";

const nino = { id: "nino", fullName: "Nino Tolaba", email: "nino@gmail.com", profileId: "cuenta-nino" };
const rene = { id: "rene", fullName: "Rene Nino Tolaba", email: null, profileId: null };
const ana = { id: "ana", fullName: "Ana Pérez", email: null, profileId: null };

describe("planFichaMerge", () => {
  it("keeps the ficha with a cuenta whichever side it is on", () => {
    expect(planFichaMerge(rene, nino)).toEqual({ kind: "merge", survivor: nino, merged: rene });
    expect(planFichaMerge(nino, rene)).toEqual({ kind: "merge", survivor: nino, merged: rene });
  });

  it("keeps the edited ficha when neither has a cuenta", () => {
    expect(planFichaMerge(ana, rene)).toEqual({ kind: "merge", survivor: ana, merged: rene });
  });

  it("blocks two cuentas and a ficha with itself", () => {
    expect(planFichaMerge(nino, { ...rene, profileId: "otra" }).kind).toBe("blocked");
    expect(planFichaMerge(rene, rene).kind).toBe("blocked");
  });
});

describe("findDuplicateFichas", () => {
  it("pairs a ficha with a cuenta with look-alike fichas without one", () => {
    expect(findDuplicateFichas([nino, rene, ana])).toEqual([
      { survivor: nino, duplicates: [rene] },
    ]);
  });

  it("pairs by email even when the names differ", () => {
    const apodo = { id: "apodo", fullName: "El Tola", email: "NINO@gmail.com ", profileId: null };

    expect(findDuplicateFichas([nino, apodo])).toEqual([
      { survivor: nino, duplicates: [apodo] },
    ]);
  });

  it("skips a pair an admin marked as two people, in either order", () => {
    expect(findDuplicateFichas([nino, rene], [["rene", "nino"]])).toEqual([]);
    expect(findDuplicateFichas([nino, rene], [["nino", "rene"]])).toEqual([]);
  });

  it("never offers a ficha that has its own cuenta", () => {
    expect(findDuplicateFichas([nino, { ...rene, profileId: "otra" }])).toEqual([]);
  });
});

describe("groupMergeOptions", () => {
  it("lists look-alike names first and leaves out the ficha itself", () => {
    expect(groupMergeOptions(nino, [ana, nino, rene])).toEqual({ similar: [rene], rest: [ana] });
  });
});
