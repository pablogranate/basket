"use client";

import Link from "next/link";
import {
  LoaderCircle,
  MessageSquare,
  Send,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { SectionAiAssistantTrigger } from "@/components/ai/section-ai-assistant-trigger";

// A `contextRef` lets the server rebuild the dataset at question time, so the
// page ships only a `contextCount` in its payload. `context` is the legacy
// client-posted blob still used by the client-only workspaces (incidencias,
// reportes) whose data has no server loader to rebuild from.
type SectionContextRef = {
  section: string;
  params?: Record<string, string>;
};

export type SectionAiAssistantProps = {
  section: string;
  title: string;
  description: string;
  placeholder: string;
  contextLabel: string;
  context?: unknown;
  contextRef?: SectionContextRef;
  contextCount?: number;
  hasGeminiKey: boolean;
  guidance?: string;
  examples?: string[];
  buttonLabel?: string;
  buttonVariant?: "default" | "icon";
  // Set by the lazy wrapper: the collaborator already clicked the placeholder
  // trigger, so the drawer opens as soon as this module finishes loading
  // instead of asking for a second click.
  defaultOpen?: boolean;
};

function getContextCount(context: unknown) {
  if (Array.isArray(context)) {
    return context.length;
  }

  if (context && typeof context === "object") {
    return Object.keys(context).length;
  }

  return 0;
}

export function SectionAiAssistant({
  section,
  title,
  description,
  placeholder,
  contextLabel,
  context,
  contextRef,
  contextCount: contextCountProp,
  hasGeminiKey,
  guidance,
  examples = [],
  buttonLabel = "Pregúntale a la IA",
  buttonVariant = "default",
  defaultOpen = false,
}: SectionAiAssistantProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const contextCount = useMemo(
    () => contextCountProp ?? getContextCount(context),
    [contextCountProp, context],
  );
  const hasContext = contextCount > 0;

  const submitQuestion = async () => {
    if (!question.trim()) {
      setError("Escribe una pregunta para la IA.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/ai/section", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          section,
          question,
          contextLabel,
          guidance,
          ...(contextRef ? { contextRef } : { context }),
        }),
      });

      const data = (await response.json()) as { answer?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error || "No pudimos consultar la IA.");
      }

      setAnswer(data.answer || "");
    } catch (nextError) {
      setAnswer("");
      setError(
        nextError instanceof Error ? nextError.message : "No pudimos consultar la IA.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <SectionAiAssistantTrigger
        variant={buttonVariant}
        label={buttonLabel}
        hasContext={hasContext}
        onClick={() => setOpen(true)}
      />

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(28,13,16,0.18)] backdrop-blur-[2px]">
          <div className="flex h-full w-full max-w-xl flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_42px_rgba(28,13,16,0.12)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-6">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-[#ecfdf3] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#16a34a]">
                    Asistente IA
                  </span>
                  <span className="text-xs text-[var(--n-400)]">{section}</span>
                </div>
                <h3 className="text-2xl font-black tracking-tight text-[var(--foreground)]">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--n-600)]">{description}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex size-10 items-center justify-center rounded-full bg-[var(--background-soft)] text-[var(--n-400)] transition hover:text-[var(--foreground)]"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-5 overflow-y-auto px-6 py-6">
              {!hasGeminiKey ? (
                <div className="panel-radius border border-[#ccebd7] bg-[#f6fff9] p-4 text-sm text-[#426050]">
                  Configura tu API key de Gemini en Configuración para habilitar este
                  asistente.
                  <Link
                    href="/settings"
                    className="mt-3 inline-flex items-center gap-2 rounded-[var(--panel-radius)] bg-[#16a34a] px-3 py-2 text-xs font-bold text-white"
                  >
                    <Settings2 className="size-3.5" />
                    Abrir configuración
                  </Link>
                </div>
              ) : null}

              {!hasContext ? (
                <div className="panel-radius border border-[var(--border)] bg-[var(--background-soft)] p-4 text-sm text-[var(--n-600)]">
                  Esta sección todavía no tiene datos visibles para consultar.
                </div>
              ) : (
                <div className="panel-radius border border-[var(--border)] bg-[var(--background-soft)] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[var(--n-600)]">
                      <Sparkles className="size-3.5 text-[#16a34a]" />
                      {contextCount} registros visibles
                    </span>
                    <span className="text-xs text-[var(--n-400)]">{contextLabel}</span>
                  </div>
                </div>
              )}

              <div className="panel-radius border border-[var(--border)] bg-[var(--background-soft)] p-4">
                <label className="mb-2 block text-sm font-bold text-[var(--n-700)]">
                  Tu pregunta
                </label>
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder={placeholder}
                  className="min-h-28 w-full rounded-[var(--panel-radius)] border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--n-400)] focus:border-[#22c55e] focus:ring-4 focus:ring-[rgba(34,197,94,0.12)]"
                />

                {examples.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {examples.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => setQuestion(example)}
                        className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--n-600)] transition hover:border-[#bbf7d0] hover:text-[#16a34a]"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={submitQuestion}
                    disabled={!hasGeminiKey || !hasContext || isLoading}
                    className="inline-flex items-center gap-2 rounded-[var(--panel-radius)] bg-[#16a34a] px-4 py-2.5 text-sm font-bold text-white shadow-[0_12px_24px_rgba(34,197,94,0.22)] disabled:opacity-50"
                  >
                    {isLoading ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    Consultar
                  </button>
                </div>
              </div>

              {error ? (
                <div className="panel-radius border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4 text-sm text-[var(--accent-strong)]">
                  {error}
                </div>
              ) : null}

              <div className="panel-radius border border-[var(--border)] bg-white p-5">
                <div className="mb-3 flex items-center gap-2">
                  <MessageSquare className="size-4 text-[#16a34a]" />
                  <h4 className="text-sm font-extrabold text-[var(--foreground)]">
                    Respuesta
                  </h4>
                </div>
                <div className="min-h-36 whitespace-pre-wrap text-sm leading-7 text-[var(--n-700)]">
                  {answer ||
                    "Todavía no hay respuesta. Haz una consulta y la IA responderá usando solo los datos visibles de esta sección."}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
