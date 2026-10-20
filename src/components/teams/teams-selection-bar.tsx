"use client";

import { useTeamsEdit } from "@/components/teams/teams-edit-context";
import { Button } from "@/components/ui/button";
import { ARCHIVED_TEAM_LEAGUE, type TeamDirectoryTab } from "@/lib/team-directory";
import type { TeamDragPayload } from "@/lib/team-drag";

// Floating actions for the cards selected in edit mode: the same moves as
// dragging the group onto a tab, for when the tab row is out of reach.
export function TeamsSelectionBar({
  teams,
  leagues,
  fromLeague,
  canArchive,
  onSelectAll,
}: {
  teams: TeamDragPayload[];
  leagues: TeamDirectoryTab[];
  fromLeague: string | null;
  canArchive: boolean;
  onSelectAll: () => void;
}) {
  const { requestMove, clearSelection, isMoving } = useTeamsEdit();

  return (
    <div
      data-teams-selection-bar
      className="panel-surface fixed bottom-4 left-1/2 z-[200] flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 border border-[var(--border)] bg-[var(--surface)] py-2 pl-4 pr-2 text-sm shadow-[var(--shadow-lift)]"
    >
      <span className="font-bold text-[var(--foreground)]">
        {teams.length} {teams.length === 1 ? "seleccionado" : "seleccionados"}
      </span>
      <select
        value=""
        disabled={isMoving}
        aria-label="Mover los equipos seleccionados a otra liga"
        onChange={(event) => {
          if (event.target.value) {
            requestMove({ teams, target: event.target.value, fromLeague });
          }
        }}
        className="h-9 rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-semibold text-[var(--n-700)]"
      >
        <option value="">Mover a…</option>
        {leagues.map((league) => (
          <option key={league.value} value={league.value}>
            {league.label}
          </option>
        ))}
      </select>
      {canArchive ? (
        <Button
          type="button"
          variant="secondary"
          disabled={isMoving}
          onClick={() =>
            requestMove({ teams, target: ARCHIVED_TEAM_LEAGUE, fromLeague: null })
          }
          className="h-9 px-3 text-xs"
        >
          Archivar
        </Button>
      ) : null}
      <Button type="button" variant="ghost" onClick={onSelectAll} className="h-9 px-3 text-xs">
        Seleccionar todos
      </Button>
      <Button type="button" variant="ghost" onClick={clearSelection} className="h-9 px-3 text-xs">
        Limpiar
      </Button>
    </div>
  );
}
