"use client";

import { ChevronDown, Folder } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import {
  archiveTeamAction,
  assignTeamToLeagueAction,
} from "@/app/actions/teams";
import { Button } from "@/components/ui/button";
import { splitTeamCompetitions, type TeamDirectoryTab } from "@/lib/team-directory";
import {
  parseTeamDragPayload,
  TEAM_DRAG_MIME,
  type TeamDragPayload,
} from "@/lib/team-drag";
import { cn } from "@/lib/utils";

export type ArchivedTeam = {
  id: string;
  name: string;
};

// Teams without a league this season. A card dropped on the folder leaves all
// its leagues (the team itself stays); a row dragged onto a league tab, or the
// row's league picker, brings it back.
export function TeamsArchivedFolder({
  teams,
  tabs,
  canManageTeams,
}: {
  teams: ArchivedTeam[];
  tabs: TeamDirectoryTab[];
  canManageTeams: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<TeamDragPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function isTeamDrag(event: React.DragEvent) {
    return event.dataTransfer.types.includes(TEAM_DRAG_MIME);
  }

  function handleDrop(event: React.DragEvent) {
    if (!isTeamDrag(event)) {
      return;
    }

    event.preventDefault();
    setDragOver(false);

    const team = parseTeamDragPayload(event.dataTransfer.getData(TEAM_DRAG_MIME));

    if (team && splitTeamCompetitions(team.competition).length) {
      setErrorMessage("");
      setPendingArchive(team);
    }
  }

  function closeDialog() {
    setPendingArchive(null);
    setErrorMessage("");
  }

  function confirmArchive() {
    if (!pendingArchive || isPending) {
      return;
    }

    startTransition(async () => {
      const result = await archiveTeamAction({ teamId: pendingArchive.id });

      if (result.ok) {
        closeDialog();
      } else {
        setErrorMessage(result.error ?? "No se pudo archivar el equipo.");
      }
    });
  }

  function assignToLeague(team: ArchivedTeam, leagueName: string) {
    if (!leagueName || isPending) {
      return;
    }

    setErrorMessage("");
    startTransition(async () => {
      const result = await assignTeamToLeagueAction({
        teamId: team.id,
        leagueName,
        mode: "add",
      });

      if (!result.ok) {
        setErrorMessage(result.error ?? "No se pudo asignar el equipo.");
      }
    });
  }

  const pendingLeagues = pendingArchive
    ? splitTeamCompetitions(pendingArchive.competition)
    : [];

  return (
    <div ref={menuRef} className="relative shrink-0 pb-1.5">
      <button
        type="button"
        aria-expanded={open}
        data-team-drop-target={canManageTeams ? "" : undefined}
        onClick={() => setOpen((current) => !current)}
        onDragOver={
          canManageTeams
            ? (event) => {
                if (isTeamDrag(event)) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOver(true);
                }
              }
            : undefined
        }
        onDragLeave={canManageTeams ? () => setDragOver(false) : undefined}
        onDrop={canManageTeams ? handleDrop : undefined}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-[var(--panel-radius)] border border-dashed px-3 text-xs font-bold transition",
          open
            ? "border-solid border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
            : "border-[var(--n-300)] text-[var(--muted)] hover:border-solid hover:bg-[var(--surface)] hover:text-[var(--foreground)]",
          dragOver && "bg-[var(--accent-soft)] text-[var(--accent)] ring-2 ring-[var(--accent)] ring-offset-1",
        )}
      >
        <Folder className="size-4" />
        Archivados
        <span className="font-mono text-[11px] font-normal text-[var(--n-500)]">{teams.length}</span>
        <ChevronDown className={cn("size-3.5 transition", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="panel-surface absolute right-0 top-[calc(100%+0.25rem)] z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lift)]">
          <div className="flex items-baseline justify-between gap-3 border-b border-[var(--n-100)] px-4 py-2.5 text-sm font-semibold">
            Equipos archivados
            {canManageTeams ? (
              <span className="text-xs font-normal text-[var(--n-500)]">
                Arrastrá a una liga para asignar
              </span>
            ) : null}
          </div>
          {errorMessage && !pendingArchive ? (
            <p role="alert" className="px-4 pt-2 text-xs font-semibold text-[var(--accent)]">
              {errorMessage}
            </p>
          ) : null}
          {teams.length === 0 ? (
            <p className="px-4 py-5 text-center text-sm text-[var(--n-500)]">
              {canManageTeams
                ? "Arrastrá la tarjeta de un equipo sin liga hasta esta carpeta."
                : "No hay equipos archivados."}
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto p-1.5">
              {teams.map((team) => (
                <ArchivedRow
                  key={team.id}
                  team={team}
                  tabs={tabs}
                  canManageTeams={canManageTeams}
                  disabled={isPending}
                  onAssign={(leagueName) => assignToLeague(team, leagueName)}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {pendingArchive
        ? createPortal(
            <div
              className="fixed inset-0 z-[300] flex items-center justify-center bg-[var(--n-900)]/60 p-4 backdrop-blur-sm"
              onClick={closeDialog}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Archivar equipo"
                onClick={(event) => event.stopPropagation()}
                className="panel-surface relative flex w-full max-w-md flex-col gap-3 border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_24px_64px_rgba(28,13,16,0.22)]"
              >
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  ¿Archivar {pendingArchive.name}?
                </p>
                <p className="text-sm text-[var(--n-600)]">
                  Sale de {pendingLeagues.join(" y ")}. El equipo se conserva en
                  Archivados hasta que lo asignes a una liga.
                </p>

                {errorMessage ? (
                  <p className="text-sm font-semibold text-[var(--accent)]">
                    {errorMessage}
                  </p>
                ) : null}

                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={closeDialog}
                    disabled={isPending}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    onClick={confirmArchive}
                    disabled={isPending}
                  >
                    Archivar
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function ArchivedRow({
  team,
  tabs,
  canManageTeams,
  disabled,
  onAssign,
}: {
  team: ArchivedTeam;
  tabs: TeamDirectoryTab[];
  canManageTeams: boolean;
  disabled: boolean;
  onAssign: (leagueName: string) => void;
}) {
  return (
    <li
      draggable={canManageTeams || undefined}
      onDragStart={
        canManageTeams
          ? (event) => {
              const payload: TeamDragPayload = {
                id: team.id,
                name: team.name,
                competition: "",
              };
              event.dataTransfer.setData(TEAM_DRAG_MIME, JSON.stringify(payload));
              event.dataTransfer.effectAllowed = "move";
            }
          : undefined
      }
      className={cn(
        "flex items-center justify-between gap-2 rounded-[calc(var(--panel-radius)-4px)] px-3 py-1.5 hover:bg-[var(--n-50)]",
        canManageTeams && "cursor-grab active:cursor-grabbing",
      )}
    >
      <span className="min-w-0 flex-1 truncate text-xs font-bold text-[var(--foreground)]">
        {team.name}
      </span>
      {canManageTeams ? (
        <select
          value=""
          disabled={disabled}
          aria-label={`Asignar ${team.name} a una liga`}
          onChange={(event) => onAssign(event.target.value)}
          className="h-7 shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 text-xs text-[var(--n-600)]"
        >
          <option value="">Asignar a liga…</option>
          {tabs.map((tab) => (
            <option key={tab.value} value={tab.value}>
              {tab.label}
            </option>
          ))}
        </select>
      ) : null}
    </li>
  );
}
