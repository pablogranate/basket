"use client";

import Link from "next/link";
import { ArrowUpDown } from "lucide-react";

import { GridNavPending } from "@/components/grid/grid-nav-pending";
import { cn } from "@/lib/utils";

// Ascending/descending flip for the /grid list. Rendered twice — in the desktop
// toolbar and, on phones, next to the past-days control — so the markup lives
// here instead of being duplicated in the page.
//
// Was a raw <a> (full document reload per flip). No prefetch: the flipped order
// is a whole second copy of the current window's payload, and unlike the date
// arrows there is no adjacency to bet on.
export function GridDateOrderToggle({
  href,
  dateOrder,
  className,
}: {
  href: string;
  dateOrder: "asc" | "desc";
  className?: string;
}) {
  const label =
    dateOrder === "asc"
      ? "Ordenar desde la fecha más reciente"
      : "Ordenar desde la fecha más antigua";

  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={label}
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[#7f8ca0] shadow-[0_8px_18px_rgba(15,23,42,0.06)] transition hover:border-[rgba(230,18,56,0.24)] hover:text-[var(--accent)]",
        dateOrder === "desc" &&
          "border-[rgba(230,18,56,0.18)] bg-[#fff4f6] text-[var(--accent)]",
        className,
      )}
    >
      <GridNavPending>
        <ArrowUpDown className="size-4" />
      </GridNavPending>
    </Link>
  );
}
