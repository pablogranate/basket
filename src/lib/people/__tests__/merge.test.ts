import { describe, expect, it } from "vitest";

import { findDuplicateFichas, groupMergeOptions, planFichaMerge } from "@/lib/people/merge";

const leo = { id: "leo", fullName: "Leo Sosa", email: "leo@example.com", profileId: "cuenta-leo" };
const martin = { id: "martin", fullName: "Martin Leo Sosa", email: null, profileId: null };
const ana = { id: "ana", fullName: "Ana Pérez", email: null, profileId: null };

describe("planFichaMerge", () => {
  it("keeps the ficha with a cuenta whichever side it is on", () => {
    expect(planFichaMerge(martin, leo)).toEqual({ kind: "merge", survivor: leo, merged: martin });
    expect(planFichaMerge(leo, martin)).toEqual({ kind: "merge", survivor: leo, merged: martin });
  });

  it("keeps the edited ficha when neither has a cuenta", () => {
    expect(planFichaMerge(ana, martin)).toEqual({ kind: "merge", survivor: ana, merged: martin });
  });

  it("blocks two cuentas and a ficha with itself", () => {
    expect(planFichaMerge(leo, { ...martin, profileId: "otra" }).kind).toBe("blocked");
    expect(planFichaMerge(martin, martin).kind).toBe("blocked");
  });
});

describe("findDuplicateFichas", () => {
  it("pairs a ficha with a cuenta with look-alike fichas without one", () => {
    expect(findDuplicateFichas([leo, martin, ana])).toEqual([
      { survivor: leo, duplicates: [martin] },
    ]);
  });

  it("pairs by email even when the names differ", () => {
    const apodo = { id: "apodo", fullName: "El Flaco", email: "LEO@example.com ", profileId: null };

    expect(findDuplicateFichas([leo, apodo])).toEqual([
      { survivor: leo, duplicates: [apodo] },
    ]);
  });

  it("skips a pair an admin marked as two people, in either order", () => {
    expect(findDuplicateFichas([leo, martin], [["martin", "leo"]])).toEqual([]);
    expect(findDuplicateFichas([leo, martin], [["leo", "martin"]])).toEqual([]);
  });

  it("never offers a ficha that has its own cuenta", () => {
    expect(findDuplicateFichas([leo, { ...martin, profileId: "otra" }])).toEqual([]);
  });
});

describe("groupMergeOptions", () => {
  it("lists look-alike names first and leaves out the ficha itself", () => {
    expect(groupMergeOptions(leo, [ana, leo, martin])).toEqual({ similar: [martin], rest: [ana] });
  });
});
