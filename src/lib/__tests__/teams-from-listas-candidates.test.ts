import { describe, expect, it } from "vitest";

import { findNameCandidates } from "@/lib/people/teams-from-listas";

// A slice of the live roster, picked for the families that trip a similarity
// ratio: several "Independiente de …", "Gimnasia y Esgrima de …" and two teams
// carrying "Las Heras".
const KNOWN = [
  "Club Atlético Pilar",
  "Atlético Sastre",
  "Morón",
  "Boca Juniors",
  "Independiente de General Pico",
  "Independiente de Oliva",
  "Gimnasia y Esgrima de Rosario",
  "Gimnasia y Esgrima de La Plata",
  "Huracán Las Heras",
  "Las Heras de Villa Ballester",
  "Náutico Hacoaj",
];

describe("findNameCandidates", () => {
  it("flags a name whose words are contained in a known club", () => {
    expect(findNameCandidates("Atlético Pilar", KNOWN)).toEqual([
      "Club Atlético Pilar",
    ]);
  });

  it("flags a name that contains a known club", () => {
    expect(findNameCandidates("Deportivo Morón", KNOWN)).toEqual(["Morón"]);
  });

  it("returns every club a short name could be", () => {
    expect(findNameCandidates("Las Heras", KNOWN)).toEqual([
      "Huracán Las Heras",
      "Las Heras de Villa Ballester",
    ]);
  });

  it("does not pair clubs that merely share a surname", () => {
    expect(findNameCandidates("Imperio Juniors", KNOWN)).toEqual([]);
    expect(findNameCandidates("Independiente de Burzaco", KNOWN)).toEqual([]);
    expect(findNameCandidates("Gimnasia y Esgrima de Lomas", KNOWN)).toEqual([]);
    expect(findNameCandidates("Náutico Buchardo", KNOWN)).toEqual([]);
  });

  it("ignores accents and case, and never matches a name to itself", () => {
    expect(findNameCandidates("MORON", KNOWN)).toEqual([]);
    expect(findNameCandidates("boca juniors", KNOWN)).toEqual([]);
  });

  it("leaves an unrelated name alone", () => {
    expect(findNameCandidates("Ateneo Popular Versailles", KNOWN)).toEqual([]);
  });
});
