"use client";

import { useState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import type {
  ExistingAccountResolution,
  ExistingAccountView,
} from "@/lib/access-requests/existing-account";
import { cn } from "@/lib/utils";

const SUBMIT_LABEL: Record<ExistingAccountResolution, string> = {
  keepExisting: "Rechazar y avisarle",
  keepNew: "Aprobar y pasar la ficha",
  separate: "Aprobar como persona distinta",
};

function outcome(
  resolution: ExistingAccountResolution,
  account: ExistingAccountView,
  applicant: { email: string; fullName: string },
) {
  if (resolution === "keepExisting") {
    return [
      "La solicitud queda rechazada; no se crea otra cuenta ni otra ficha.",
      `Le llega un mail a ${applicant.email}: "Ya tenés acceso: entrá con ${account.email}".`,
      account.accessLabel
        ? `Su cuenta ${account.email} sigue igual.`
        : `${account.email} recupera el acceso, con el nivel elegido arriba.`,
    ];
  }

  if (resolution === "keepNew") {
    return [
      `Se aprueba ${applicant.email} y se le pasa la ficha ${account.fullName} con sus ${account.assignmentCount} partidos.`,
      `La cuenta ${account.email} se borra: si intenta entrar con ella, ve el formulario de solicitud.`,
      "Las solicitudes y la auditoría de la cuenta vieja pasan a la nueva.",
    ];
  }

  return [
    `Se aprueba como persona distinta: se crea una ficha nueva "${applicant.fullName}".`,
    `Ojo: la grilla va a tener dos "${applicant.fullName}". Usalo solo si de verdad son dos personas.`,
  ];
}

export function ExistingAccountChoiceClient({
  account,
  applicant,
}: {
  account: ExistingAccountView;
  applicant: { email: string; fullName: string };
}) {
  const [resolution, setResolution] = useState<ExistingAccountResolution>(
    account.recommended,
  );

  const options: { value: ExistingAccountResolution; title: string; detail: string }[] = [
    {
      value: "keepExisting",
      title: `Con la que ya tiene · ${account.email}`,
      detail: "Se rechaza esta solicitud y se le avisa por mail con qué cuenta entrar.",
    },
    {
      value: "keepNew",
      title: `Con esta nueva · ${applicant.email}`,
      detail: "Se le pasa la ficha y el acceso; la otra cuenta se borra.",
    },
    {
      value: "separate",
      title: "Son personas distintas",
      detail: "Se aprueba como siempre y se crea una ficha nueva.",
    },
  ];

  return (
    <div className="space-y-3">
      <input type="hidden" name="existingPersonId" value={account.personId} />
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--n-500)]">
        ¿Con qué cuenta entra?
      </p>
      <div className="space-y-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-[var(--panel-radius)] border bg-[var(--surface)] px-3 py-2.5 text-sm",
              resolution === option.value
                ? "border-[var(--foreground)] shadow-[0_0_0_1px_var(--foreground)]"
                : "border-[var(--border)]",
            )}
          >
            <input
              type="radio"
              name="resolution"
              value={option.value}
              checked={resolution === option.value}
              onChange={() => setResolution(option.value)}
              className="mt-1"
            />
            <span className="min-w-0">
              <span className="font-semibold break-words">{option.title}</span>
              {account.recommended === option.value ? (
                <span className="ml-1 text-xs font-semibold text-[var(--ok)]">· recomendado</span>
              ) : null}
              <span className="block text-xs text-[var(--n-500)]">{option.detail}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--n-500)]">
          Qué pasa al confirmar
        </p>
        <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm text-[var(--n-700)]">
          {outcome(resolution, account, applicant).map((line) => (
            <li key={line} className="break-words">{line}</li>
          ))}
        </ol>
      </div>

      <SubmitButton pendingLabel="Guardando...">{SUBMIT_LABEL[resolution]}</SubmitButton>
    </div>
  );
}
