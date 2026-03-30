import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SegmentedControlItem = {
  key: string;
  label: ReactNode;
  active?: boolean;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
};

export function SegmentedControl({
  items,
  size = "md",
  className,
}: {
  items: SegmentedControlItem[];
  size?: "sm" | "md";
  className?: string;
}) {
  const wrapperClassName =
    size === "sm"
      ? "h-10 gap-1 p-1 shadow-sm"
      : "h-[52px] gap-1 p-1";

  const itemClassName =
    size === "sm"
      ? "px-3 text-xs font-bold"
      : "px-4 text-sm font-semibold";

  return (
    <div
      className={cn(
        "flex items-center rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--background-soft)]",
        wrapperClassName,
        className,
      )}
    >
      {items.map((item) => {
        const sharedClassName = cn(
          "inline-flex h-full items-center rounded-[calc(var(--panel-radius)-4px)] transition",
          itemClassName,
          item.active
            ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
            : "text-[var(--muted)] hover:text-[var(--foreground)]",
          item.disabled && "pointer-events-none opacity-50",
        );

        if (item.href) {
          return (
            <Link key={item.key} href={item.href} className={sharedClassName}>
              {item.label}
            </Link>
          );
        }

        return (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            disabled={item.disabled}
            className={sharedClassName}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
