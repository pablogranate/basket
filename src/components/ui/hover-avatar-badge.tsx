"use client";

import { cn } from "@/lib/utils";

export function HoverAvatarBadge({
  initials,
  roleLabel,
  showTooltip = true,
  tone = "accent",
  size = "md",
  className,
}: {
  initials: string;
  roleLabel?: string;
  showTooltip?: boolean;
  tone?: "accent" | "neutral";
  size?: "sm" | "md";
  className?: string;
}) {
  const sizeClassName = size === "sm" ? "size-8 text-[11px]" : "size-10 text-xs";
  const toneClassName =
    tone === "accent"
      ? "bg-[var(--accent-border)] text-[var(--accent)]"
      : "bg-[var(--n-100)] text-[var(--n-600)]";

  return (
    <div className={cn("group relative inline-flex shrink-0", className)}>
      <div
        className={cn(
          "inline-flex items-center justify-center rounded-full border border-[var(--border)] font-black shadow-sm transition-transform duration-200 delay-0 group-hover:scale-[1.32] group-hover:delay-[900ms]",
          sizeClassName,
          toneClassName,
        )}
      >
        {initials}
      </div>
      {roleLabel && showTooltip ? (
        <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg bg-[var(--n-800)] px-2.5 py-1.5 text-[11px] font-bold text-white opacity-0 shadow-lg transition-all duration-150 delay-0 group-hover:translate-y-0 group-hover:opacity-100 group-hover:delay-[900ms]">
          {roleLabel}
        </div>
      ) : null}
    </div>
  );
}
