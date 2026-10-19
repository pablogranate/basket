"use client";

import { useState } from "react";

import { mergePeopleAction } from "@/app/actions/people";
import { PeopleRedirectToInput } from "@/components/people/people-redirect-to";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { groupMergeOptions, planFichaMerge, type MergeFicha } from "@/lib/people/merge";

function describeFicha(ficha: MergeFicha) {
  const details = [ficha.email, ficha.profileId ? "con cuenta" : null].filter(Boolean);

  return details.length ? `${ficha.fullName} · ${details.join(" · ")}` : ficha.fullName;
}

export function PersonMergeForm({
  current,
  options,
}: {
  current: MergeFicha;
  options: MergeFicha[];
}) {
  const [otherId, setOtherId] = useState("");
  const { similar, rest } = groupMergeOptions(current, options);
  const other = [...similar, ...rest].find((option) => option.id === otherId) ?? null;
  const plan = other ? planFichaMerge(current, other) : null;

  return (
    <form
      action={mergePeopleAction}
      className="space-y-3"
      onSubmit={(event) => {
        if (plan?.kind !== "merge") {
          event.preventDefault();
          return;
        }

        const confirmed = window.confirm(
          `${plan.merged.fullName} se archiva y sus partidos, notificaciones, equipos y funciones pasan a ${plan.survivor.fullName}. No se puede deshacer desde la app. ¿Quieres continuar?`,
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="personId" value={current.id} />
      <PeopleRedirectToInput />
      <Select
        name="otherPersonId"
        value={otherId}
        onChange={(event) => setOtherId(event.target.value)}
        required
      >
        <option value="">Elegí la otra ficha</option>
        {similar.length ? (
          <optgroup label="Nombres parecidos">
            {similar.map((option) => (
              <option key={option.id} value={option.id}>
                {describeFicha(option)}
              </option>
            ))}
          </optgroup>
        ) : null}
        <optgroup label="Todas">
          {rest.map((option) => (
            <option key={option.id} value={option.id}>
              {describeFicha(option)}
            </option>
          ))}
        </optgroup>
      </Select>

      {plan ? (
        plan.kind === "merge" ? (
          <p className="text-sm text-[var(--n-600)]">
            Queda <strong>{plan.survivor.fullName}</strong>; se archiva{" "}
            <strong>{plan.merged.fullName}</strong> y su historial pasa a la que
            queda.
          </p>
        ) : (
          <p className="text-sm text-[var(--accent-strong)]">{plan.reason}</p>
        )
      ) : null}

      <SubmitButton
        variant="secondary"
        pendingLabel="Fusionando..."
        className="h-11 px-5"
      >
        Fusionar fichas
      </SubmitButton>
    </form>
  );
}
