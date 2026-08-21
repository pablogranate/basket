import { describe, expect, it } from "vitest";

import { buildPersonNotesMeta } from "@/lib/people-notes";
import {
  EMPTY_PEOPLE_FILTERS,
  STATE_HIDE_INACTIVE,
  UNASSIGNED_OPTION,
  applyPeopleFilters,
  derivePeopleFilterOptions,
  parsePeopleFilters,
} from "@/lib/people-filters";
import type { PersonFunctionKey } from "@/lib/functions";
import type { PersonListItem } from "@/lib/types";

type PersonInput = {
  id?: string;
  name: string;
  functions?: PersonFunctionKey[];
  city?: string;
  coverage?: string;
  state?: PersonListItem["assignment_state"];
  active?: boolean;
  phone?: string | null;
  email?: string | null;
  notes?: string;
};

let counter = 0;

function makePerson(input: PersonInput): PersonListItem {
  counter += 1;
  return {
    id: input.id ?? `p-${counter}`,
    full_name: input.name,
    assignment_state: input.state ?? "Disponible",
    active: input.active ?? true,
    phone: input.phone ?? null,
    email: input.email ?? null,
    notes: buildPersonNotesMeta({
      city: input.city ?? "",
      coverage: input.coverage ?? "",
      notes: input.notes ?? "",
    }),
    current_assignment_count: 0,
    functions: input.functions ?? [],
  } as unknown as PersonListItem;
}

const PEOPLE: PersonListItem[] = [
  makePerson({
    name: "Santiago Cordoba",
    functions: ["Relator"],
    city: "Bogotá",
    coverage: "Boca Juniors, River Plate",
    state: "En asignacion",
  }),
  makePerson({
    name: "Juan Camilo",
    functions: ["Camara"],
    city: "bogota",
    coverage: "Boca Juniors",
    state: "Disponible",
  }),
  makePerson({
    name: "Samuel Venegas",
    functions: ["Productor"],
    city: "Medellín",
    coverage: "Independiente",
    state: "Inactivo",
    active: false,
  }),
  makePerson({
    name: "Persona Sin Datos",
  }),
];

describe("parsePeopleFilters", () => {
  it("returns empty defaults when no params are present", () => {
    expect(parsePeopleFilters({})).toEqual(EMPTY_PEOPLE_FILTERS);
  });

  it("passes through free-text facets and a valid state", () => {
    const filters = parsePeopleFilters({
      role: "Relator",
      state: "En asignacion",
      city: "Bogotá",
      team: "Boca Juniors",
    });
    expect(filters).toEqual({
      role: "Relator",
      state: "En asignacion",
      city: "Bogotá",
      team: "Boca Juniors",
    });
  });

  it("drops an unknown state back to empty", () => {
    expect(parsePeopleFilters({ state: "Vacaciones" }).state).toBe("");
  });

  it("trims values", () => {
    const filters = parsePeopleFilters({
      role: "  Relator  ",
      city: " Bogotá ",
    });
    expect(filters.role).toBe("Relator");
    expect(filters.city).toBe("Bogotá");
  });

  // The client workspace parses `useSearchParams()` while the page parses the
  // `searchParams` record. Both paths must land on the same filters or a
  // shareable URL would render one thing and hydrate into another.
  it("reads URLSearchParams the same way as a searchParams record", () => {
    const params = new URLSearchParams({
      q: "cordoba",
      role: "  Relator  ",
      state: "Vacaciones",
      city: " Bogotá ",
      team: "Boca Juniors",
    });

    expect(parsePeopleFilters(params)).toEqual(
      parsePeopleFilters({
        q: "cordoba",
        role: "  Relator  ",
        state: "Vacaciones",
        city: " Bogotá ",
        team: "Boca Juniors",
      }),
    );
    expect(parsePeopleFilters(params)).toEqual({
      role: "Relator",
      state: "",
      city: "Bogotá",
      team: "Boca Juniors",
    });
  });
});

describe("applyPeopleFilters", () => {
  it("returns everyone when no filters or query are set", () => {
    const result = applyPeopleFilters({
      people: PEOPLE,
      filters: EMPTY_PEOPLE_FILTERS,
      query: "",
    });
    expect(result).toHaveLength(PEOPLE.length);
  });

  it("narrows by role (matches any of the person's funciones)", () => {
    const result = applyPeopleFilters({
      people: PEOPLE,
      filters: { ...EMPTY_PEOPLE_FILTERS, role: "Relator" },
      query: "",
    });
    expect(result.map((p) => p.full_name)).toEqual(["Santiago Cordoba"]);
  });

  it("matches Estado against the derived assignment_state", () => {
    const result = applyPeopleFilters({
      people: PEOPLE,
      filters: { ...EMPTY_PEOPLE_FILTERS, state: "Inactivo" },
      query: "",
    });
    expect(result.map((p) => p.full_name)).toEqual(["Samuel Venegas"]);
  });

  it("excludes Inactivo people for the STATE_HIDE_INACTIVE option, keeping the rest", () => {
    const result = applyPeopleFilters({
      people: PEOPLE,
      filters: { ...EMPTY_PEOPLE_FILTERS, state: STATE_HIDE_INACTIVE },
      query: "",
    });
    expect(result.every((p) => p.assignment_state !== "Inactivo")).toBe(true);
    expect(result.map((p) => p.full_name)).not.toContain("Samuel Venegas");
    expect(result).toHaveLength(
      PEOPLE.filter((p) => p.assignment_state !== "Inactivo").length,
    );
  });

  it("matches Ciudad across casing/accent variants", () => {
    const result = applyPeopleFilters({
      people: PEOPLE,
      filters: { ...EMPTY_PEOPLE_FILTERS, city: "bogota" },
      query: "",
    });
    expect(result.map((p) => p.full_name).sort()).toEqual([
      "Juan Camilo",
      "Santiago Cordoba",
    ]);
  });

  it("matches Responsable via any one of several covered teams", () => {
    const result = applyPeopleFilters({
      people: PEOPLE,
      filters: { ...EMPTY_PEOPLE_FILTERS, team: "River Plate" },
      query: "",
    });
    expect(result.map((p) => p.full_name)).toEqual(["Santiago Cordoba"]);
  });

  it("ANDs multiple facets together", () => {
    const result = applyPeopleFilters({
      people: PEOPLE,
      filters: { ...EMPTY_PEOPLE_FILTERS, city: "Bogotá", team: "Boca Juniors" },
      query: "",
    });
    expect(result.map((p) => p.full_name).sort()).toEqual([
      "Juan Camilo",
      "Santiago Cordoba",
    ]);
  });

  it("ANDs a facet with the search term", () => {
    const result = applyPeopleFilters({
      people: PEOPLE,
      filters: { ...EMPTY_PEOPLE_FILTERS, team: "Boca Juniors" },
      query: "juan",
    });
    expect(result.map((p) => p.full_name)).toEqual(["Juan Camilo"]);
  });

  it("matches blank-field people via the (Sin asignar) sentinel", () => {
    const result = applyPeopleFilters({
      people: PEOPLE,
      filters: { ...EMPTY_PEOPLE_FILTERS, city: UNASSIGNED_OPTION },
      query: "",
    });
    expect(result.map((p) => p.full_name)).toEqual(["Persona Sin Datos"]);
  });
});

describe("derivePeopleFilterOptions", () => {
  it("collapses city variants into one canonical option", () => {
    const { cities } = derivePeopleFilterOptions([
      makePerson({ name: "A", city: "Bogotá" }),
      makePerson({ name: "B", city: "bogota" }),
      makePerson({ name: "C", city: "Bogota " }),
    ]);
    const realCities = cities.filter((c) => c !== UNASSIGNED_OPTION);
    expect(realCities).toHaveLength(1);
  });

  it("lists distinct funciones and teams from the full set", () => {
    const { roles, teams } = derivePeopleFilterOptions(PEOPLE);
    const roleValues = roles.map((role) => role.value);
    expect(roleValues).toContain("Relator");
    expect(roleValues).toContain("Camara");
    expect(roleValues).toContain("Productor");
    expect(teams).toContain("Boca Juniors");
    expect(teams).toContain("River Plate");
  });

  it("appends (Sin asignar) only when a blank-field person exists", () => {
    const withBlank = derivePeopleFilterOptions(PEOPLE);
    expect(withBlank.roles.map((role) => role.value)).toContain(
      UNASSIGNED_OPTION,
    );
    expect(withBlank.cities).toContain(UNASSIGNED_OPTION);

    const noBlank = derivePeopleFilterOptions([
      makePerson({
        name: "X",
        functions: ["Relator"],
        city: "Cali",
        coverage: "Cali FC",
      }),
    ]);
    expect(noBlank.roles.map((role) => role.value)).not.toContain(
      UNASSIGNED_OPTION,
    );
    expect(noBlank.cities).not.toContain(UNASSIGNED_OPTION);
    expect(noBlank.teams).not.toContain(UNASSIGNED_OPTION);
  });
});
