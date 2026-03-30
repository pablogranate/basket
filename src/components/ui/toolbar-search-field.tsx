"use client";

import type { ChangeEventHandler, ReactNode } from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

import { Input } from "./input";

type ToolbarSearchFieldProps = {
  placeholder: string;
  className?: string;
  shellClassName?: string;
  inputClassName?: string;
  iconClassName?: string;
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  children?: ReactNode;
} & (
  | {
      as?: "form";
      action?: string;
    }
  | {
      as: "div";
      action?: never;
    }
);

export function ToolbarSearchField({
  as = "form",
  action,
  placeholder,
  className,
  shellClassName,
  inputClassName,
  iconClassName,
  name = "q",
  defaultValue,
  value,
  onChange,
  children,
}: ToolbarSearchFieldProps) {
  const Comp = as;

  return (
    <Comp
      {...(as === "form" ? { action } : {})}
      className={cn(
        "flex min-w-[320px] flex-1 items-center rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-sm",
        className,
      )}
    >
      {children}
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 rounded-[var(--panel-radius)] bg-[var(--background-soft)] px-3",
          shellClassName,
        )}
      >
        <Search className={cn("size-4 text-[var(--accent)]", iconClassName)} />
        <Input
          name={name}
          defaultValue={defaultValue}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={cn(
            "h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0",
            inputClassName,
          )}
        />
      </div>
    </Comp>
  );
}
