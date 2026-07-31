"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { ToolbarSearchField } from "@/components/ui/toolbar-search-field";
import { SERVER_RENDERED_PEOPLE_PARAMS } from "@/components/people/people-redirect-to";

// Client-side search over the people list the page already shipped. Was a plain
// <form action="/people">, i.e. a browser GET — every search paid a full
// document reload and threw away the router cache. Keystrokes now update the URL
// via history.replaceState (shallow, debounced) so the workspace re-filters
// instantly and the URL stays shareable.
export function PeopleSearchField({ className }: { className?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const urlQuery = searchParams.get("q") ?? "";
  const [value, setValue] = useState(urlQuery);
  // Mirrors the typed text so the URL-sync effect can compare against it without
  // taking `value` as a dependency (which would re-run it on every keystroke and
  // stomp what is being typed).
  const valueRef = useRef(urlQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Back/forward (or any other URL change) wins, but a URL that already agrees
    // with what is typed must not write back: commit() stores the trimmed query,
    // and re-syncing from it would eat a trailing space mid-word and jump the
    // caret.
    if (urlQuery !== valueRef.current.trim()) {
      valueRef.current = urlQuery;
      setValue(urlQuery);
    }
  }, [urlQuery]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  function commit(nextValue: string) {
    const params = new URLSearchParams(window.location.search);
    if (nextValue.trim()) {
      params.set("q", nextValue.trim());
    } else {
      params.delete("q");
    }

    // Dropping a server-rendered param (the edit modal, the notice banner) needs
    // the RSC to re-render, which a shallow update cannot do.
    const serverRendered = SERVER_RENDERED_PEOPLE_PARAMS.filter((key) =>
      params.has(key),
    );
    for (const key of serverRendered) {
      params.delete(key);
    }

    const query = params.toString();
    const href = query ? `/people?${query}` : "/people";

    if (serverRendered.length) {
      startTransition(() => {
        router.push(href);
      });
      return;
    }

    window.history.replaceState(null, "", href);
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    valueRef.current = nextValue;
    setValue(nextValue);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => commit(nextValue), 200);
  }

  return (
    <ToolbarSearchField
      as="div"
      value={value}
      onChange={handleChange}
      placeholder="Buscar nombre, rol, responsable o ciudad..."
      className={className}
    />
  );
}
