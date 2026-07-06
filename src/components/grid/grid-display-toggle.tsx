"use client";

import { useEffect, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

import { SegmentedControl } from "@/components/ui/segmented-control";

const GRID_DISPLAY_STORAGE_KEY = "basket-production.grid.display";

type GridDisplay = "cards" | "table";

type GridDisplayToggleProps = {
  display: GridDisplay;
  hasExplicitParam: boolean;
  baseSearchParams: Record<string, string>;
};

function isGridDisplay(value: string | null): value is GridDisplay {
  return value === "cards" || value === "table";
}

export function GridDisplayToggle({
  display,
  hasExplicitParam,
  baseSearchParams,
}: GridDisplayToggleProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function buildHref(nextDisplay: GridDisplay) {
    const params = new URLSearchParams(baseSearchParams);
    params.set("display", nextDisplay);
    params.delete("intent");
    params.delete("notice");

    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function handleSelect(nextDisplay: GridDisplay) {
    window.localStorage.setItem(GRID_DISPLAY_STORAGE_KEY, nextDisplay);
    startTransition(() => {
      router.push(buildHref(nextDisplay));
    });
  }

  useEffect(() => {
    if (hasExplicitParam) {
      return;
    }

    const stored = window.localStorage.getItem(GRID_DISPLAY_STORAGE_KEY);
    if (isGridDisplay(stored) && stored !== display) {
      router.replace(buildHref(stored));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={isPending ? "opacity-60 transition-opacity" : "transition-opacity"}
      aria-busy={isPending}
    >
    <SegmentedControl
      items={[
        {
          key: "cards",
          label: "Tarjetas",
          active: display === "cards",
          onClick: () => handleSelect("cards"),
        },
        {
          key: "table",
          label: "Grilla",
          active: display === "table",
          onClick: () => handleSelect("table"),
        },
      ]}
    />
    </div>
  );
}
