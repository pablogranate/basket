"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { GRID_DISPLAY_COOKIE, type GridDisplay } from "@/lib/search-params";

const DISPLAY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type GridDisplayToggleProps = {
  display: GridDisplay;
  baseSearchParams: Record<string, string>;
};

// The chosen view is persisted in a cookie so the /grid RSC can honour it on the
// very first render. It used to live in localStorage and be applied after mount
// with a router.replace, which made every table-preferring arrival at /grid pay
// for a second full grid render.
export function GridDisplayToggle({
  display,
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
    document.cookie = `${GRID_DISPLAY_COOKIE}=${nextDisplay}; path=/; max-age=${DISPLAY_COOKIE_MAX_AGE}; samesite=lax`;
    startTransition(() => {
      router.push(buildHref(nextDisplay));
    });
  }

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
