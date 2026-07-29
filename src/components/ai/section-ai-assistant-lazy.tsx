"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { SectionAiAssistantTrigger } from "@/components/ai/section-ai-assistant-trigger";
import type { SectionAiAssistantProps } from "@/components/ai/section-ai-assistant";

// The assistant is a drawer behind a single button: its markup, its Gemini
// fetch, and its icons are dead weight until someone opens it. On /mi-jornada it
// is also hidden below the `md` breakpoint, so on the page's primary surface
// (mobile) it would hydrate for a widget the collaborator never sees.
//
// This paints only the trigger and pulls the real module in on the first click,
// handing it `defaultOpen` so that click still opens the drawer.
const SectionAiAssistant = dynamic(
  () =>
    import("@/components/ai/section-ai-assistant").then(
      (mod) => mod.SectionAiAssistant,
    ),
  { ssr: false },
);

// `contextCount` is required here, unlike on the assistant itself: the trigger's
// disabled state has to be decided without loading the module that knows how to
// count a raw `context` blob.
type LazySectionAiAssistantProps = SectionAiAssistantProps & {
  contextCount: number;
};

export function LazySectionAiAssistant({
  buttonLabel = "Pregúntale a la IA",
  buttonVariant = "default",
  ...props
}: LazySectionAiAssistantProps) {
  const [activated, setActivated] = useState(false);
  const hasContext = props.contextCount > 0;

  if (!activated) {
    return (
      <SectionAiAssistantTrigger
        variant={buttonVariant}
        label={buttonLabel}
        hasContext={hasContext}
        onClick={() => setActivated(true)}
      />
    );
  }

  return (
    <SectionAiAssistant
      {...props}
      buttonLabel={buttonLabel}
      buttonVariant={buttonVariant}
      defaultOpen
    />
  );
}
