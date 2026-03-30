import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type InsightBarRowProps = {
  icon: ReactNode;
  label: ReactNode;
  value: ReactNode;
  bar: ReactNode;
  className?: string;
  iconContainerClassName?: string;
  contentClassName?: string;
  headerClassName?: string;
  labelClassName?: string;
  valueClassName?: string;
  barContainerClassName?: string;
};

export function InsightBarRow({
  icon,
  label,
  value,
  bar,
  className,
  iconContainerClassName,
  contentClassName,
  headerClassName,
  labelClassName,
  valueClassName,
  barContainerClassName,
}: InsightBarRowProps) {
  return (
    <div className={cn("grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-x-3.5", className)}>
      <div className={cn("flex h-full items-center justify-center", iconContainerClassName)}>
        {icon}
      </div>
      <div className={cn("min-w-0 flex-1", contentClassName)}>
        <div
          className={cn(
            "mb-1.5 flex items-center justify-between gap-3 leading-tight",
            headerClassName,
          )}
        >
          <span className={cn("truncate text-sm font-bold text-[#617187]", labelClassName)}>
            {label}
          </span>
          <span className={cn("shrink-0 text-sm font-black text-[var(--foreground)]", valueClassName)}>
            {value}
          </span>
        </div>
        <div className={cn("h-2.5 overflow-hidden rounded-full bg-[#edf1f6]", barContainerClassName)}>
          {bar}
        </div>
      </div>
    </div>
  );
}
