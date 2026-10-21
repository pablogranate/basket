"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { createLeagueAction, renameLeagueAction } from "@/app/actions/leagues";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_LEAGUE_NAME_LENGTH, parseLeagueName } from "@/lib/leagues/league-name";

// No league named: create one. Otherwise: rename that league.
export function LeagueNameDialog({
  league,
  teamCount = 0,
  onClose,
  onSaved,
}: {
  league?: string;
  teamCount?: number;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [name, setName] = useState(league ?? "");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, startSaving] = useTransition();
  const isRename = league !== undefined;

  function close() {
    if (!isSaving) {
      onClose();
    }
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const parsed = parseLeagueName(name);

    if (!parsed.ok) {
      setErrorMessage(parsed.error);
      return;
    }

    if (isRename && parsed.name === league) {
      onClose();
      return;
    }

    startSaving(async () => {
      const result = isRename
        ? await renameLeagueAction({ currentName: league, name: parsed.name })
        : await createLeagueAction({ name: parsed.name });

      if (result.ok) {
        onSaved(result.name);
      } else {
        setErrorMessage(result.error);
      }
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-[var(--n-900)]/60 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={isRename ? "Renombrar liga" : "Nueva liga"}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            close();
          }
        }}
        onSubmit={save}
        className="panel-surface relative flex w-full max-w-md flex-col gap-3 border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_24px_64px_rgba(28,13,16,0.22)]"
      >
        <p className="text-sm font-semibold text-[var(--foreground)]">
          {isRename ? `Renombrar ${league}` : "Nueva liga"}
        </p>

        <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--n-700)]">
          Nombre
          <Input
            autoFocus
            value={name}
            maxLength={MAX_LEAGUE_NAME_LENGTH}
            placeholder="Ej. Liga Femenina Chile"
            onChange={(event) => {
              setName(event.target.value);
              setErrorMessage("");
            }}
            onFocus={(event) => event.target.select()}
            disabled={isSaving}
          />
        </label>

        {isRename ? (
          <p className="text-sm text-[var(--n-600)]">
            {teamCount === 1
              ? "Su equipo y sus partidos siguen en esta liga."
              : `Sus ${teamCount} equipos y sus partidos siguen en esta liga.`}
          </p>
        ) : (
          <p className="text-sm text-[var(--n-600)]">
            Arrastrá equipos a la pestaña nueva para sumarlos.
          </p>
        )}

        {errorMessage ? (
          <p role="alert" className="text-sm font-semibold text-[var(--accent)]">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close} disabled={isSaving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isRename ? "Guardar" : "Crear liga"}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
