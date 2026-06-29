"use client";

import { Bot, LoaderCircle, MessageSquare, Send, Settings2, X } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

import type { PeopleAiContextItem } from "@/lib/people-ai";

export function PeopleAiAssistant({
  people,
  hasGeminiKey,
}: {
  people: PeopleAiContextItem[];
  hasGeminiKey: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const submitQuestion = async () => {
    if (!question.trim()) {
      setError("Escribe una pregunta para la IA.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/ai/people", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question,
          people,
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--n-700)] shadow-sm transition hover:border-[var(--n-200)] hover:bg-[var(--n-50)]"
      >
        <Bot className="size-4 text-[var(--accent)]" />
        Pregúntale a la IA
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(28,13,16,0.18)] backdrop-blur-[2px]">
          <div className="flex h-full w-full max-w-xl flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_42px_rgba(28,13,16,0.12)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-6">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--accent)]">
                    Asistente IA
                  </span>
                  <span className="text-xs text-[var(--n-400)]">
                    Módulo Personal
                  </span>
                </div>
                <h3 className="text-2xl font-black tracking-tight text-[var(--foreground)]">
                  Consulta el personal visible
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--n-500)]">
                  Haz preguntas como “qué rol tiene Santiago Córdoba” o “quién
                  cubre Boca Juniors”.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex size-10 items-center justify-center rounded-full bg-[var(--background-soft)] text-[var(--n-400)] transition hover:text-[var(--foreground)]"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-5 px-6 py-6">
              {!hasGeminiKey ? (
                <div className="rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4 text-sm text-[var(--accent-strong)]">
                  Configura tu API key de Gemini en Configuración para habilitar este
                  asistente.
                  <Link
                    href="/settings"
                    className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-bold text-white"
                  >
                    <Settings2 className="size-3.5" />
                    Abrir configuración
                  </Link>
                </div>
              ) : null}

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--background-soft)] p-4">
                <label className="mb-2 block text-sm font-bold text-[var(--n-700)]">
                  Tu pregunta
                </label>
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Ej. Qué rol tiene Santiago Córdoba, Juan Camilo y Samuel Venegas?"
                  className="min-h-28 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--n-400)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[rgba(227,27,35,0.08)]"
                />
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={submitQuestion}
                    disabled={!hasGeminiKey || isLoading}
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white shadow-[0_12px_24px_rgba(227,27,35,0.18)] disabled:opacity-50"
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
                <div className="rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4 text-sm text-[var(--accent-strong)]">
                  {error}
                </div>
              ) : null}

              <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
                <div className="mb-3 flex items-center gap-2">
                  <MessageSquare className="size-4 text-[var(--accent)]" />
                  <h4 className="text-sm font-extrabold text-[var(--foreground)]">
                    Respuesta
                  </h4>
                </div>
                <div className="min-h-36 whitespace-pre-wrap text-sm leading-7 text-[var(--n-700)]">
                  {answer ||
                    "Todavía no hay respuesta. Haz una consulta y la IA responderá usando solo el personal visible en esta pantalla."}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
