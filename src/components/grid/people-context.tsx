"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { GridOwner } from "@/lib/types";

// People list shared across the grid. Provided ONCE at the grid root so it
// crosses the server→client boundary a single time. Without this, passing
// `people` as a prop into each of the hundreds of per-match client components
// (MatchCardActions) re-serialized the whole list into the RSC payload per
// card — inflating the /grid document to ~15MB. Per-card components read it
// from context (a client→client read, never serialized into the HTML).
const PeopleContext = createContext<GridOwner[]>([]);

export function PeopleProvider({
  people,
  children,
}: {
  people: GridOwner[];
  children: ReactNode;
}) {
  return <PeopleContext.Provider value={people}>{children}</PeopleContext.Provider>;
}

export function usePeople() {
  return useContext(PeopleContext);
}
