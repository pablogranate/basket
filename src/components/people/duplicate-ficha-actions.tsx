"use client";

import { dismissDuplicatePairAction, mergePeopleAction } from "@/app/actions/people";
import { SubmitButton } from "@/components/ui/submit-button";

export function DuplicateFichaActions({
  survivor,
  duplicate,
  redirectTo,
}: {
  survivor: { id: string; fullName: string };
  duplicate: { id: string; fullName: string };
  redirectTo: string;
}) {
  const pairFields = (
    <>
      <input type="hidden" name="personId" value={survivor.id} />
      <input type="hidden" name="otherPersonId" value={duplicate.id} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
    </>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        action={mergePeopleAction}
        onSubmit={(event) => {
          const confirmed = window.confirm(
            `${duplicate.fullName} se archiva y sus partidos, notificaciones, equipos y funciones pasan a ${survivor.fullName}. No se puede deshacer desde la app. ¿Quieres continuar?`,
          );

          if (!confirmed) {
            event.preventDefault();
          }
        }}
      >
        {pairFields}
        <SubmitButton variant="ghost" pendingLabel="Fusionando..." className="h-9 px-3 text-xs">
          Fusionar
        </SubmitButton>
      </form>
      <form action={dismissDuplicatePairAction}>
        {pairFields}
        <SubmitButton variant="ghost" pendingLabel="Guardando..." className="h-9 px-3 text-xs">
          No es la misma persona
        </SubmitButton>
      </form>
    </div>
  );
}
