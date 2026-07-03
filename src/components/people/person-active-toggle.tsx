"use client";

import { Power } from "lucide-react";
import { useOptimistic } from "react";

import { togglePersonActiveAction } from "@/app/actions/people";
import { cn } from "@/lib/utils";

// Directory power-button palettes, lifted verbatim from getStatePresentation so
// the optimistic flip recolors the control instantly (green ⇄ neutral) instead
// of waiting for the server round trip + revalidation to repaint it.
const POWER_ACTIVE_CLASSNAME =
  "border-[#cdeed7] bg-[#f1fcf5] text-[#179a56] hover:border-[#bce5ca] hover:bg-[#e8faef] hover:text-[#177245]";
const POWER_INACTIVE_CLASSNAME =
  "border-[var(--n-200)] bg-white/80 text-[var(--n-400)] hover:border-[var(--n-200)] hover:bg-white hover:text-[var(--n-600)]";

// The app's first optimistic control (house pattern for instant-feeling
// toggles). The switch flips the moment it's clicked via useOptimistic; the
// server action runs inside the form transition and its revalidation confirms
// the new value. If the action rejects (it redirects with an error notice), the
// optimistic value is discarded and the control re-renders from server truth —
// the switch snaps back. `active` is always the server-confirmed state.
export function PersonActiveToggle({
  personId,
  active,
  fullName,
  canEdit,
  variant,
  redirectTo,
  className,
}: {
  personId: string;
  active: boolean;
  fullName: string;
  canEdit: boolean;
  variant: "switch" | "power";
  redirectTo?: string;
  className?: string;
}) {
  const [optimisticActive, setOptimisticActive] = useOptimistic(active);

  async function toggleAction(formData: FormData) {
    setOptimisticActive(!active);
    await togglePersonActiveAction(formData);
  }

  const actionLabel = `${optimisticActive ? "Desactivar" : "Activar"} a ${fullName}`;

  return (
    <form action={toggleAction} className={className}>
      <input type="hidden" name="personId" value={personId} />
      {/* Posted value is derived from server truth, not the optimistic flip. */}
      <input type="hidden" name="active" value={active ? "off" : "on"} />
      {redirectTo ? (
        <input type="hidden" name="redirectTo" value={redirectTo} />
      ) : null}

      {variant === "switch" ? (
        <button
          type="submit"
          role="switch"
          aria-checked={optimisticActive}
          aria-label={actionLabel}
          disabled={!canEdit}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition",
            optimisticActive
              ? "border-[#b8e7c7] bg-[#e9f9ee]"
              : "border-[var(--n-200)] bg-[var(--n-100)]",
            !canEdit && "cursor-not-allowed opacity-60",
          )}
        >
          <span
            className={cn(
              "pointer-events-none absolute left-1 inline-flex size-5 rounded-full bg-white shadow-[0_2px_6px_rgba(28,13,16,0.16)] transition-transform",
              optimisticActive && "translate-x-5",
            )}
          />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!canEdit}
          aria-label={actionLabel}
          title={optimisticActive ? "Desactivar" : "Activar"}
          className={cn(
            "inline-flex size-9 items-center justify-center rounded-full border transition",
            optimisticActive ? POWER_ACTIVE_CLASSNAME : POWER_INACTIVE_CLASSNAME,
            !canEdit && "cursor-not-allowed opacity-60",
          )}
        >
          <Power className="size-4" />
        </button>
      )}
    </form>
  );
}
