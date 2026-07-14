import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "panel-surface border border-[var(--border)] bg-[var(--surface)] p-5",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
