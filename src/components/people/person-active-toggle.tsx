"use client";

import { useOptimistic } from "react";

import { togglePersonActiveAction } from "@/app/actions/people";
import { cn } from "@/lib/utils";

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
  redirectTo,
  className,
}: {
  personId: string;
  active: boolean;
  fullName: string;
  canEdit: boolean;
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
    </form>
  );
}
