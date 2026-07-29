"use client";

import { useRouter } from "next/navigation";
import { useTransition, type FormEvent } from "react";

import { ToolbarSearchField } from "@/components/ui/toolbar-search-field";
import {
  buildGridSearchHref,
  type GridSearchHrefFilters,
} from "@/lib/grid/nav-hrefs";
import { cn } from "@/lib/utils";

// Search box for /grid. Was a plain <form action="/grid">, i.e. a browser GET —
// every search paid a full document reload just like the date arrows did.
//
// The form element stays (Enter still submits, screen readers still see a search
// form); only the browser's navigation is intercepted. The hidden inputs that
// used to carry the active filters are gone: buildGridSearchHref reproduces the
// exact same field set from `filters`, which is also what keeps the two paths
// from drifting.
export function GridSearchField({
  filters,
  hasExplicitDisplay,
  className,
}: {
  filters: GridSearchHrefFilters & { q: string };
  hasExplicitDisplay: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const query = String(new FormData(event.currentTarget).get("q") ?? "");
    const href = buildGridSearchHref({ filters, hasExplicitDisplay, query });

    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 transition-opacity",
        isPending && "opacity-60",
        className,
      )}
      aria-busy={isPending}
    >
      <ToolbarSearchField
        action="/grid"
        onSubmit={handleSubmit}
        className="w-full"
        defaultValue={filters.q}
        placeholder="Buscar partido, ID, liga o responsable..."
      />
    </div>
  );
}
