"use client";

import { useSearchParams } from "next/navigation";
import { useCallback } from "react";

// URL params whose UI is rendered on the server: the edit modal overlay and the
// notice banner. A shallow history update cannot dismiss them, so any control
// that drops one has to go through the router instead of pushState.
export const SERVER_RENDERED_PEOPLE_PARAMS = [
  "edit",
  "notice",
  "intent",
] as const;

// Where a /people mutation should land the user afterwards. This has to be read
// on the client: filters and search now move the URL through pushState /
// replaceState without re-running the RSC, so a redirect target computed during
// the server render would freeze at page-load state and silently throw away the
// filters the user is actually looking at.
export function usePeopleRedirectTo({ keepEdit = false } = {}): string {
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());

  if (!keepEdit) {
    params.delete("edit");
  }

  const query = params.toString();
  return query ? `/people?${query}` : "/people";
}

// Server-rendered forms can drop this in place of a static hidden input to pick
// up the same live target.
export function PeopleRedirectToInput({
  keepEdit = false,
}: {
  keepEdit?: boolean;
}) {
  const redirectTo = usePeopleRedirectTo({ keepEdit });

  return <input type="hidden" name="redirectTo" value={redirectTo} />;
}

// The ficha opens as `?edit=` on top of whatever the list is showing, so the
// modal's Cerrar/Cancelar (built from the server's searchParams) land back on
// the same filters instead of a bare /people.
export function usePeopleEditHref(): (personId: string) => string {
  const search = useSearchParams().toString();

  return useCallback(
    (personId: string) => {
      const params = new URLSearchParams(search);
      params.delete("notice");
      params.delete("intent");
      params.set("edit", personId);
      return `/people?${params.toString()}`;
    },
    [search],
  );
}
