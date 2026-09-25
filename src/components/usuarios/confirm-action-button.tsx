"use client";

import { cn } from "@/lib/utils";

// A one-button form that asks before submitting: identity actions reach every
// app at once, so none of them fires on a stray click.
export function ConfirmActionButton({
  action,
  fields,
  confirmMessage,
  label,
  tone = "neutral",
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  confirmMessage: string;
  label: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        className={cn(
          "inline-flex h-8 items-center rounded-[var(--panel-radius)] px-2 text-xs font-semibold transition",
          tone === "danger"
            ? "text-[var(--accent)] hover:bg-[rgba(227,27,35,0.06)]"
            : "text-[var(--n-600)] hover:bg-[var(--n-50)]",
        )}
      >
        {label}
      </button>
    </form>
  );
}
