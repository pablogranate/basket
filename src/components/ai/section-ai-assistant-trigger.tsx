"use client";

import { Bot } from "lucide-react";

// The assistant's open button, in its own module so the lazy wrapper can paint
// an identical trigger without importing the assistant (and its drawer, fetch
// logic, and icon set) into the initial bundle.
export type SectionAiAssistantTriggerProps = {
  variant: "default" | "icon";
  label: string;
  hasContext: boolean;
  onClick: () => void;
};

export const SECTION_AI_ASSISTANT_NO_CONTEXT_TITLE =
  "No hay datos visibles para consultar en esta sección.";

export function SectionAiAssistantTrigger({
  variant,
  label,
  hasContext,
  onClick,
}: SectionAiAssistantTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        variant === "icon"
          ? "inline-flex size-[52px] items-center justify-center rounded-[var(--panel-radius)] border border-[#22c55e] bg-[#22c55e] text-white shadow-[0_12px_28px_rgba(34,197,94,0.3)] transition hover:-translate-y-0.5 hover:border-[#16a34a] hover:bg-[#16a34a] disabled:cursor-not-allowed disabled:opacity-60"
          : "inline-flex h-[52px] items-center gap-2 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--n-700)] shadow-sm transition hover:border-[var(--n-200)] hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-60"
      }
      disabled={!hasContext}
      title={hasContext ? label : SECTION_AI_ASSISTANT_NO_CONTEXT_TITLE}
    >
      <Bot
        className={
          variant === "icon"
            ? "size-5 animate-[pulse_2.8s_ease-in-out_infinite]"
            : "size-4 text-[#16a34a]"
        }
      />
      {variant === "default" ? label : null}
    </button>
  );
}
