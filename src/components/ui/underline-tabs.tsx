import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type UnderlineTabItem = {
  key: string;
  label: string;
  active?: boolean;
  onClick: () => void;
  icon?: LucideIcon;
};

export function UnderlineTabs({
  items,
  variant = "drawer",
  columns,
  className,
}: {
  items: UnderlineTabItem[];
  variant?: "drawer" | "section";
  columns?: number;
  className?: string;
}) {
  const contentClassName =
    variant === "section"
      ? "flex items-center gap-8"
      : "grid gap-2";

  const itemClassName =
    variant === "section"
      ? "flex items-center gap-2 border-b-2 pb-3 text-sm font-bold transition"
      : "inline-flex min-w-0 items-center justify-center gap-1.5 border-b-2 px-1 pb-4 pt-3 text-[10px] font-black uppercase tracking-[0.12em] transition";

  return (
    <div
      className={cn(
        "border-b border-[var(--border)]",
        variant === "section" ? "" : "px-6",
        className,
      )}
    >
      <div
        className={cn(
          contentClassName,
          "border-b border-[var(--border)]/60",
        )}
        style={
          variant === "drawer" && columns
            ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
            : undefined
        }
      >
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className={cn(
                itemClassName,
                item.active
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[#94a3b8] hover:text-[#617187]",
              )}
            >
              {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
