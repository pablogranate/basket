import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type ToolbarIconTone = "violet" | "success" | "accent" | "surface";

const toolbarIconToneClassName: Record<ToolbarIconTone, string> = {
  violet:
    "bg-[#7c3aed] text-white shadow-[0_14px_28px_rgba(124,58,237,0.22)] hover:bg-[#6d28d9]",
  success:
    "border border-[#22c55e] bg-[#22c55e] text-white shadow-[0_12px_28px_rgba(34,197,94,0.3)] hover:-translate-y-0.5 hover:border-[#16a34a] hover:bg-[#16a34a]",
  accent:
    "bg-[var(--accent)] text-white shadow-[0_14px_28px_rgba(230,18,56,0.2)] hover:bg-[var(--accent-strong)]",
  surface:
    "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-sm hover:bg-[var(--background-soft)]",
};

export function getToolbarIconButtonClassName({
  tone = "violet",
  className,
}: {
  tone?: ToolbarIconTone;
  className?: string;
}) {
  return cn(
    "inline-flex size-[52px] items-center justify-center rounded-[var(--panel-radius)] transition disabled:cursor-not-allowed disabled:opacity-60",
    toolbarIconToneClassName[tone],
    className,
  );
}

type ToolbarIconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ToolbarIconTone;
  children: ReactNode;
};

export function ToolbarIconButton({
  tone = "violet",
  className,
  type = "button",
  children,
  ...props
}: ToolbarIconButtonProps) {
  return (
    <button
      type={type}
      className={getToolbarIconButtonClassName({ tone, className })}
      {...props}
    >
      {children}
    </button>
  );
}
