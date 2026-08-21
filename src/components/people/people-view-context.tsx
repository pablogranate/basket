"use client";

import { useSearchParams } from "next/navigation";
import {
  createContext,
  use,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import {
  getCityIndicator,
  getPersonRoleDisplay,
} from "@/components/people/people-view-helpers";
import {
  applyPeopleFilters,
  parsePeopleFilters,
  type PeopleFilters,
} from "@/lib/people-filters";
import { parsePersonNotesMeta } from "@/lib/people-notes";
import { personCoverageNames } from "@/lib/team-responsibles";
import type { PersonListItem } from "@/lib/types";

export type PersonView = {
  person: PersonListItem;
  city: string;
  notes: string;
  coverageNames: string[];
  detailSummary: string;
  roleLabel: string;
  rolePresentation: ReturnType<typeof getPersonRoleDisplay>["rolePresentation"];
  cityIndicator: ReturnType<typeof getCityIndicator>;
};

// Everything the table, the stat cards and the CSV export need, derived from a
// single notes parse per person.
function buildPersonView(person: PersonListItem): PersonView {
  const meta = parsePersonNotesMeta(person.notes);
  const { roleLabel, rolePresentation } = getPersonRoleDisplay(person);
  const city = meta.city || "";
  const coverageNames = personCoverageNames(person);

  return {
    person,
    city,
    notes: meta.notes,
    coverageNames,
    detailSummary: coverageNames.join(", "),
    roleLabel,
    rolePresentation,
    cityIndicator: getCityIndicator(city),
  };
}

type PeopleViewDerived = {
  viewByPerson: Map<string, PersonView>;
  filterKey: string | null;
  rows: PersonView[];
};

// A cross-component memo cache keyed on the resolved list itself. `useMemo`
// cannot serve here: the two consumers (header export/assistant and the
// workspace) sit in different Suspense boundaries, so a per-component memo would
// mean each of them filtering the whole list on every keystroke. Entries are
// pure derived data and die with the array they are keyed on.
const derivedByList = new WeakMap<PersonListItem[], PeopleViewDerived>();

function resolveRows(
  allPeople: PersonListItem[],
  filters: PeopleFilters,
  query: string,
): PersonView[] {
  let derived = derivedByList.get(allPeople);

  if (!derived) {
    derived = {
      viewByPerson: new Map(
        allPeople.map((person) => [person.id, buildPersonView(person)]),
      ),
      filterKey: null,
      rows: [],
    };
    derivedByList.set(allPeople, derived);
  }

  const filterKey = JSON.stringify([
    filters.role,
    filters.state,
    filters.city,
    filters.team,
    query,
  ]);

  if (derived.filterKey !== filterKey) {
    derived.filterKey = filterKey;
    derived.rows = applyPeopleFilters({ people: allPeople, filters, query }).map(
      (person) =>
        derived.viewByPerson.get(person.id) ?? buildPersonView(person),
    );
  }

  return derived.rows;
}

type PeopleViewContextValue = {
  peoplePromise: Promise<PersonListItem[]>;
};

const PeopleViewContext = createContext<PeopleViewContextValue | null>(null);

// The unfiltered people list crosses the server/client boundary exactly once —
// as this provider's promise — and every consumer re-derives its own slice from
// the URL. Search/filter changes then never touch the server, while a cold hit
// on /people?q=... still renders pre-filtered HTML because `useSearchParams`
// reads the very same params during SSR.
//
// The provider deliberately does not resolve the promise itself: awaiting here
// would suspend the page shell behind the people query. Consumers unwrap it
// under their own Suspense boundary and share the filter pass through
// `resolveRows`.
export function PeopleViewProvider({
  peoplePromise,
  children,
}: {
  peoplePromise: Promise<PersonListItem[]>;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ peoplePromise }), [peoplePromise]);

  return (
    <PeopleViewContext.Provider value={value}>
      {children}
    </PeopleViewContext.Provider>
  );
}

export function usePeopleView(): {
  allPeople: PersonListItem[];
  rows: PersonView[];
  filters: PeopleFilters;
  query: string;
} {
  const context = useContext(PeopleViewContext);

  if (!context) {
    throw new Error("usePeopleView requires a PeopleViewProvider ancestor.");
  }

  const allPeople = use(context.peoplePromise);
  const searchParams = useSearchParams();
  const { role, state, city, team } = parsePeopleFilters(searchParams);
  const query = searchParams.get("q")?.trim() ?? "";
  const filters = useMemo(
    () => ({ role, state, city, team }),
    [role, state, city, team],
  );

  return {
    allPeople,
    rows: resolveRows(allPeople, filters, query),
    filters,
    query,
  };
}
