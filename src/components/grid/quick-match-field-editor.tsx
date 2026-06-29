"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

import { quickUpdateMatchFieldAction } from "@/app/actions/matches";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

type QuickMatchFieldEditorProps = {
  children: React.ReactNode;
  field: "homeTeam" | "awayTeam" | "competition" | "productionMode" | "status";
  value: string;
  matchId: string;
  redirectTo: string;
  title: string;
  listId?: string;
  options?: string[];
  inputType?: "text" | "select";
  panelClassName?: string;
  triggerClassName?: string;
};

export function QuickMatchFieldEditor({
  children,
  field,
  value,
  matchId,
  redirectTo,
  title,
  listId,
  options,
  inputType = "text",
  panelClassName,
  triggerClassName,
}: QuickMatchFieldEditorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className={cn(
          "transition hover:opacity-90",
          open && "relative z-20",
          triggerClassName,
        )}
      >
        {children}
      </button>

      {open ? (
        <div
          className={cn(
            "absolute left-0 top-[calc(100%+0.75rem)] z-30 min-w-[15rem] rounded-[18px] border border-[var(--border)] bg-white p-4 shadow-[0_20px_48px_rgba(28,13,16,0.16)]",
            panelClassName,
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
              {title}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex size-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--n-50)] text-[var(--muted)] transition hover:text-[var(--foreground)]"
            >
              <X className="size-4" />
            </button>
          </div>

          <form action={quickUpdateMatchFieldAction} className="space-y-3">
            <input type="hidden" name="matchId" value={matchId} />
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <input type="hidden" name="field" value={field} />

            {inputType === "select" ? (
              <label className="block">
                <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                  Selección
                </span>
                <div className="relative">
                  <select
                    name="value"
                    defaultValue={value}
                    className="h-11 w-full appearance-none rounded-xl border border-[var(--border)] bg-[var(--n-50)] px-3 pr-10 text-sm font-medium text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(227,27,35,0.12)]"
                  >
                    {(options ?? []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
                </div>
              </label>
            ) : (
              <label className="block">
                <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                  Valor
                </span>
                <input
                  name="value"
                  defaultValue={value}
                  list={listId}
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--n-50)] px-3 text-sm font-medium text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(227,27,35,0.12)]"
                />
              </label>
            )}

            <SubmitButton pendingLabel="Guardando..." className="h-10 w-full gap-2 rounded-xl text-sm font-bold">
              <Check className="size-4" />
              Guardar cambio
            </SubmitButton>
          </form>
        </div>
      ) : null}
    </div>
  );
}
