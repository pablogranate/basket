"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ToolbarSearchField } from "@/components/ui/toolbar-search-field";

// Client-side search over the static team directory: keystrokes update the URL
// via history.replaceState (shallow, debounced) so the workspace re-filters
// instantly without a server round-trip and the URL stays shareable.
export function TeamsSearchField({ className }: { className?: string }) {
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const [value, setValue] = useState(urlQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEditingRef = useRef(false);

  useEffect(() => {
    // External URL changes (back/forward) win unless the user is mid-typing.
    if (!isEditingRef.current) {
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

    const query = params.toString();
    window.history.replaceState(null, "", query ? `/teams?${query}` : "/teams");
    isEditingRef.current = false;
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    isEditingRef.current = true;
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
      placeholder="Buscar equipo, liga o estadio..."
      className={className}
    />
  );
}
