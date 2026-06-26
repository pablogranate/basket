"use client";

import { Power } from "lucide-react";

import { revokePersonAccessAction } from "@/app/actions/people";
import { cn } from "@/lib/utils";

export function PersonRevokeAccessButton({
  personId,
  redirectTo,
  className,
}: {
  personId: string;
  redirectTo: string;
  className?: string;
}) {
  return (
    <form
      action={revokePersonAccessAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          "Vas a revocar el acceso de este colaborador a la plataforma. ¿Quieres continuar?",
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <button
        type="submit"
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-[var(--panel-radius)] px-4 text-sm font-semibold text-[var(--accent)] transition hover:bg-[rgba(227,27,35,0.06)]",
          className,
        )}
      >
        <Power className="size-4" />
        Revocar acceso
      </button>
    </form>
  );
}
