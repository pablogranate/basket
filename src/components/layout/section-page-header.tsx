import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SectionPageHeader({
  title,
  description,
  actions,
  className,
  contentClassName,
  descriptionClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
  descriptionClassName?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-8 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className={cn("space-y-2", contentClassName)}>
        <h2 className="font-[family-name:var(--font-oswald)] text-3xl font-bold tracking-tight text-[var(--foreground)] md:text-4xl">
          {title}
        </h2>
        {description ? (
          <p
            className={cn(
              "max-w-2xl text-sm font-medium text-[var(--n-600)]",
              descriptionClassName,
            )}
          >
            {description}
          </p>
        ) : null}
      </div>

      {actions ? (
        <div className="flex flex-wrap items-center gap-3">{actions}</div>
      ) : null}
    </section>
  );
}
