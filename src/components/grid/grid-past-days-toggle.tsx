"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode } from "react";
import { History, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

function ToggleIcon({ open }: { open: boolean }) {
  const { pending } = useLinkStatus();

  if (pending) {
    return <Loader2 className="size-4 animate-spin" />;
  }

  return open ? null : <History className="size-4" />;
}

// Toggle link for the past-day cards. Navigates with `past=1` so the server
// only renders (and serializes) the expensive past-day cards when the user
// asks for them — the collapsed month payload carries today onward only.
// Rendered twice: once in the desktop toolbar's left column, once
// (mobile-only) inside the content.
export function GridPastDaysButton({
  count,
  href,
  open,
  // Optional control rendered beside the toggle; the grid mobile nav parks the
  // date-order sort button here (sort is only meaningful across multiple days).
  accessory,
  className,
}: {
  count: number;
  href: string;
  open: boolean;
  accessory?: ReactNode;
  className?: string;
}) {
  const router = useRouter();

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Not eagerly prefetched — the expanded payload is the expensive one.
          Warmed on hover/focus so the click is not a cold round-trip. */}
      <Link
        href={href}
        scroll={false}
        prefetch={false}
        onPointerEnter={() => router.prefetch(href)}
        onFocus={() => router.prefetch(href)}
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--muted)] shadow-[var(--shadow-rest)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent)]",
          open && "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]",
        )}
      >
        <ToggleIcon open={open} />
        {open
          ? "Ocultar días anteriores"
          : `Ver días anteriores (${count})`}
      </Link>
      {accessory}
    </div>
  );
}
