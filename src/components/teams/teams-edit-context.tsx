"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  archiveTeamsAction,
  assignTeamsToLeagueAction,
} from "@/app/actions/teams";
import { Button } from "@/components/ui/button";
import { ARCHIVED_TEAM_LEAGUE, splitTeamCompetitions } from "@/lib/team-directory";
import type { TeamDragPayload } from "@/lib/team-drag";

type PendingMove = {
  teams: TeamDragPayload[];
  target: string;
  fromLeague: string | null;
};

type TeamsEditContextValue = {
  editing: boolean;
  setEditing: (editing: boolean) => void;
  selectedIds: ReadonlySet<string>;
  setSelectedIds: (ids: ReadonlySet<string>) => void;
  toggleSelected: (id: string) => void;
  clearSelection: () => void;
  draggingIds: ReadonlySet<string>;
  setDraggingIds: (ids: ReadonlySet<string>) => void;
  // target is a league name or ARCHIVED_TEAM_LEAGUE.
  requestMove: (move: PendingMove) => void;
  isMoving: boolean;
};

const EMPTY_IDS: ReadonlySet<string> = new Set();

const TeamsEditContext = createContext<TeamsEditContextValue | null>(null);

export function useTeamsEdit() {
  const value = useContext(TeamsEditContext);

  if (!value) {
    throw new Error("useTeamsEdit must be used inside TeamsEditProvider.");
  }

  return value;
}

const hasLeague = (team: TeamDragPayload) =>
  splitTeamCompetitions(team.competition).length > 0;

// Edit mode on /teams: while it is on, cards show a selection circle and can be
// dragged (alone or as the selected group) onto a league tab or "Archivados".
// The tabs and the cards live in separate Suspense regions, so the selection
// and the confirm dialogs are shared through this provider.
export function TeamsEditProvider({ children }: { children: ReactNode }) {
  const [editing, setEditingState] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(EMPTY_IDS);
  const [draggingIds, setDraggingIds] = useState<ReadonlySet<string>>(EMPTY_IDS);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isMoving, startMoving] = useTransition();

  function setEditing(next: boolean) {
    setEditingState(next);
    setSelectedIds(EMPTY_IDS);
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(EMPTY_IDS);
  }

  useEffect(() => {
    if (!editing) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || pending) {
        return;
      }

      if (selectedIds.size) {
        setSelectedIds(EMPTY_IDS);
      } else {
        setEditingState(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [editing, pending, selectedIds]);

  function run(move: PendingMove, mode: "move" | "add" | "archive") {
    startMoving(async () => {
      const teamIds = move.teams.map((team) => team.id);
      const result =
        mode === "archive"
          ? await archiveTeamsAction({ teamIds })
          : await assignTeamsToLeagueAction({
              teamIds,
              leagueName: move.target,
              mode,
              fromLeague: move.fromLeague,
            });

      if (result.ok) {
        setPending(null);
        setErrorMessage("");
        setSelectedIds(EMPTY_IDS);
      } else {
        setPending(move);
        setErrorMessage(
          result.error ??
            (mode === "archive"
              ? "No se pudo archivar."
              : "No se pudo actualizar el equipo."),
        );
      }
    });
  }

  function requestMove(move: PendingMove) {
    if (isMoving) {
      return;
    }

    setErrorMessage("");

    if (move.target === ARCHIVED_TEAM_LEAGUE) {
      const teams = move.teams.filter(hasLeague);
      if (teams.length) {
        setPending({ ...move, teams });
      }
      return;
    }

    const teams = move.teams.filter(
      (team) =>
        move.fromLeague ||
        !splitTeamCompetitions(team.competition).includes(move.target),
    );

    if (!teams.length) {
      return;
    }

    // Archived teams have no league to move out of: they just join this one.
    if (!teams.some(hasLeague)) {
      run({ ...move, teams }, "add");
      return;
    }

    setPending({ ...move, teams });
  }

  function closeDialog() {
    if (isMoving) {
      return;
    }
    setPending(null);
    setErrorMessage("");
  }

  const value: TeamsEditContextValue = {
    editing,
    setEditing,
    selectedIds,
    setSelectedIds,
    toggleSelected,
    clearSelection,
    draggingIds,
    setDraggingIds,
    requestMove,
    isMoving,
  };

  return (
    <TeamsEditContext.Provider value={value}>
      {children}
      {pending ? (
        <MoveDialog
          move={pending}
          errorMessage={errorMessage}
          isMoving={isMoving}
          onClose={closeDialog}
          onConfirm={(mode) => run(pending, mode)}
        />
      ) : null}
    </TeamsEditContext.Provider>
  );
}

function MoveDialog({
  move,
  errorMessage,
  isMoving,
  onClose,
  onConfirm,
}: {
  move: PendingMove;
  errorMessage: string;
  isMoving: boolean;
  onClose: () => void;
  onConfirm: (mode: "move" | "add" | "archive") => void;
}) {
  const isArchive = move.target === ARCHIVED_TEAM_LEAGUE;
  const single = move.teams.length === 1 ? move.teams[0] : null;
  const subject = single
    ? `el equipo ${single.name}`
    : `los ${move.teams.length} equipos`;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-[var(--n-900)]/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isArchive ? "Archivar equipos" : "Asignar equipos a liga"}
        onClick={(event) => event.stopPropagation()}
        className="panel-surface relative flex w-full max-w-md flex-col gap-3 border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_24px_64px_rgba(28,13,16,0.22)]"
      >
        <p className="text-sm font-semibold text-[var(--foreground)]">
          {isArchive
            ? `¿Archivar ${subject}?`
            : `¿Se ${single ? "agrega" : "agregan"} ${subject} a la liga ${move.target}, o se ${single ? "mueve" : "mueven"} a esa liga?`}
        </p>
        <p className="text-sm text-[var(--n-600)]">
          {isArchive
            ? "Salen de todas sus ligas y quedan en Archivados hasta que los muevas a una liga."
            : move.fromLeague
              ? `Mover los saca de ${move.fromLeague}; agregar los deja también donde están.`
              : `Mover los deja solo en ${move.target}; agregar los deja también donde están.`}
        </p>

        {single ? null : (
          <ul className="max-h-36 list-disc overflow-y-auto pl-5 text-xs text-[var(--n-700)]">
            {move.teams.map((team) => (
              <li key={team.id}>{team.name}</li>
            ))}
          </ul>
        )}

        {errorMessage ? (
          <p className="text-sm font-semibold text-[var(--accent)]">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isMoving}>
            Cancelar
          </Button>
          {isArchive ? (
            <Button type="button" onClick={() => onConfirm("archive")} disabled={isMoving}>
              Archivar
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onConfirm("add")}
                disabled={isMoving}
              >
                Agregar
              </Button>
              <Button type="button" onClick={() => onConfirm("move")} disabled={isMoving}>
                Mover
              </Button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
