import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function SectionTableCard({
  title,
  icon: Icon,
  badge,
  footer,
  children,
  className,
  headerClassName,
  footerClassName,
  titleClassName,
  iconClassName,
}: {
  title: string;
  icon?: LucideIcon;
  badge?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  footerClassName?: string;
  titleClassName?: string;
  iconClassName?: string;
}) {
  return (
    <section
      className={cn(
        "panel-surface overflow-hidden border border-[var(--border)] bg-[var(--surface)]",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-4 border-b border-[var(--n-100)] px-8 py-6",
          headerClassName,
        )}
      >
        <h3
          className={cn(
            "flex items-center gap-2 text-xl font-bold text-[var(--foreground)]",
            titleClassName,
          )}
        >
          {Icon ? <Icon className={cn("size-5 text-[var(--accent)]", iconClassName)} /> : null}
          {title}
        </h3>
        {badge ? badge : null}
      </div>
      {children}
      {footer ? (
        <div
          className={cn(
            "flex items-center justify-between gap-4 bg-[var(--n-50)] px-8 py-5",
            footerClassName,
          )}
        >
          {footer}
        </div>
      ) : null}
    </section>
  );
}
