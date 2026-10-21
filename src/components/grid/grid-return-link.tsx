"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore, type ComponentProps } from "react";

const GRID_RETURN_STORAGE_KEY = "basket-production.grid.return-href.v1";
const TRANSIENT_GRID_PARAMS = ["notice", "intent", "notify"] as const;

// Records the /grid URL the user is looking at (view, date, search, filters) so
// pages reached from it — the match detail and its notificar step — can link
// back to the same slice instead of a bare /grid. Session storage rather than a
// URL param: match pages redirect to themselves after every save, and a
// `from=` param would have to survive all of those redirects.
export function GridReturnRecorder() {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    const params = new URLSearchParams(search);
    for (const key of TRANSIENT_GRID_PARAMS) {
      params.delete(key);
    }

    const query = params.toString();
    try {
      window.sessionStorage.setItem(
        GRID_RETURN_STORAGE_KEY,
        query ? `${pathname}?${query}` : pathname,
      );
    } catch {
      // Storage blocked: the return links fall back to a bare /grid.
    }
  }, [pathname, search]);

  return null;
}

function readGridReturnHref() {
  try {
    const stored = window.sessionStorage.getItem(GRID_RETURN_STORAGE_KEY);
    return stored?.startsWith("/grid") ? stored : "/grid";
  } catch {
    return "/grid";
  }
}

// Session storage never changes while a match page is open, so there is
// nothing to subscribe to; the server snapshot keeps SSR on the bare /grid.
function subscribeToNothing() {
  return () => {};
}

export function GridReturnLink(
  props: Omit<ComponentProps<typeof Link>, "href">,
) {
  const href = useSyncExternalStore(
    subscribeToNothing,
    readGridReturnHref,
    () => "/grid",
  );

  return <Link href={href} {...props} />;
}
