"use client";

import { Power } from "lucide-react";

import { revokePersonAccessAction } from "@/app/actions/people";
import { cn } from "@/lib/utils";
import { PeopleRedirectToInput } from "@/components/people/people-redirect-to";

export function PersonRevokeAccessButton({
  personId,
  className,
}: {
  personId: string;
  className?: string;
}) {
  return (
    <form
      action={revokePersonAccessAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          "Vas a deshabilitar el acceso de este colaborador a la plataforma. No lo recuperará al editarlo ni en la próxima sincronización. ¿Quieres continuar?",
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="personId" value={personId} />
      <PeopleRedirectToInput keepEdit />
      <button
        type="submit"
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-[var(--panel-radius)] px-4 text-sm font-semibold text-[var(--accent)] transition hover:bg-[rgba(227,27,35,0.06)]",
          className,
        )}
      >
        <Power className="size-4" />
        Deshabilitar acceso
      </button>
    </form>
  );
}
