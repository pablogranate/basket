import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type ExpandDividerProps = {
  expanded?: boolean;
  disabled?: boolean;
  onToggle?: () => void;
  collapsedLabel: string;
  expandedLabel: string;
  className?: string;
  lineClassName?: string;
  buttonClassName?: string;
  buttonSizeClassName?: string;
  iconClassName?: string;
};

export function ExpandDivider({
  expanded = false,
  disabled = false,
  onToggle,
  collapsedLabel,
  expandedLabel,
  className,
  lineClassName,
  buttonClassName,
  buttonSizeClassName = "size-7",
  iconClassName = "size-3.5",
}: ExpandDividerProps) {
  return (
    <div className={cn("relative py-[0.35rem]", className)}>
      <div className={cn("absolute inset-x-0 top-1/2 border-t", lineClassName)} />
      <div className="relative flex justify-center">
        <button
          type="button"
          onClick={disabled ? undefined : onToggle}
          disabled={disabled}
          className={cn(
            "inline-flex items-center justify-center rounded-full border bg-white shadow-sm transition",
            buttonSizeClassName,
            buttonClassName,
          )}
          aria-expanded={expanded}
          aria-label={expanded ? expandedLabel : collapsedLabel}
        >
          <ChevronDown
            className={cn("transition-transform", iconClassName, expanded ? "rotate-180" : "")}
          />
        </button>
      </div>
    </div>
  );
}
