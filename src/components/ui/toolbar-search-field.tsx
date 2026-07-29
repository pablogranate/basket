"use client";

import type { ChangeEventHandler, FormEventHandler, ReactNode } from "react";
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
      // Lets a caller keep the form's semantics (Enter submits, the field is
      // labelled as a search form) while handling navigation itself instead of
      // letting the browser do a full-document GET.
      onSubmit?: FormEventHandler<HTMLFormElement>;
    }
  | {
      as: "div";
      action?: never;
      onSubmit?: never;
    }
);

export function ToolbarSearchField({
  as = "form",
  action,
  onSubmit,
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
  const shellClassNames = cn(
    "flex min-w-[min(320px,100%)] flex-1 items-center rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-sm",
    className,
  );

  const body = (
    <>
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
    </>
  );

  if (as === "div") {
    return <div className={shellClassNames}>{body}</div>;
  }

  return (
    <form action={action} onSubmit={onSubmit} className={shellClassNames}>
      {body}
    </form>
  );
}
