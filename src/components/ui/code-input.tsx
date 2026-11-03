"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

// One real input stretched transparently over the boxes, so iOS one-time-code
// autofill, paste and the numeric keyboard keep working as with a plain field.
export function CodeInput({
  length,
  value,
  onChange,
  invalid = false,
  label,
}: {
  length: number;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  label: string;
}) {
  const [focused, setFocused] = useState(false);
  const activeIndex = Math.min(value.length, length - 1);

  function moveCaretToEnd(input: HTMLInputElement) {
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }

  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}
      >
        {Array.from({ length }, (_, index) => {
          const char = value[index] ?? "";
          const active = focused && index === activeIndex;
          return (
            <div
              key={index}
              className={cn(
                "flex h-14 items-center justify-center rounded-[var(--panel-radius)] border bg-[var(--background)] text-2xl font-bold text-[var(--foreground)] transition",
                invalid ? "border-[var(--accent)]" : "border-[var(--border)]",
                active && "border-[var(--accent)] ring-2 ring-[rgba(227,27,35,0.12)]",
              )}
            >
              {char}
              {active && !char ? (
                <span className="h-6 w-px animate-pulse bg-[var(--foreground)]" />
              ) : null}
            </div>
          );
        })}
      </div>
      <input
        type="text"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={length}
        value={value}
        onChange={(event) =>
          onChange(event.target.value.replace(/\D/g, "").slice(0, length))
        }
        onFocus={(event) => {
          setFocused(true);
          moveCaretToEnd(event.currentTarget);
        }}
        onBlur={() => setFocused(false)}
        onClick={(event) => moveCaretToEnd(event.currentTarget)}
        autoFocus
        aria-label={label}
        aria-invalid={invalid}
        className="absolute inset-0 h-full w-full bg-transparent text-base text-transparent caret-transparent outline-none selection:bg-transparent"
      />
    </div>
  );
}
