"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { TeamCard } from "@/components/teams/team-card";
import { useTeamsEdit } from "@/components/teams/teams-edit-context";
import { TeamsSelectionBar } from "@/components/teams/teams-selection-bar";
import { EmptyState } from "@/components/ui/empty-state";
import type { TeamResponsibleContact } from "@/lib/team-responsibles";
import type { TeamDirectoryItem, TeamDirectoryTab } from "@/lib/team-directory";
import type { TeamDragPayload } from "@/lib/team-drag";
import {
  ARCHIVED_TEAM_LEAGUE,
  isTeamArchived,
  resolveActiveTeamLeague,
  splitTeamCompetitions,
} from "@/lib/team-directory";

function filterTeams(
  teams: TeamDirectoryItem[],
  params: { query?: string; league?: string },
) {
  const query = params.query?.trim().toLowerCase() ?? "";
  const league = params.league?.trim() ?? "";
  const archivedView = league === ARCHIVED_TEAM_LEAGUE;

  return teams.filter((team) => {
    if (isTeamArchived(team) !== archivedView) {
      return false;
    }

    if (league && !archivedView && !splitTeamCompetitions(team.competition).includes(league)) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [
      team.official_name,
      team.competition,
      team.stadium ?? "",
      team.manager ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

const NO_IDS: ReadonlySet<string> = new Set();

function toDragPayload(team: TeamDirectoryItem): TeamDragPayload {
  return {
    id: team.id,
    name: team.official_name,
    competition: team.competition,
  };
}

type LassoBox = { left: number; top: number; width: number; height: number };

const LASSO_THRESHOLD_PX = 4;
const LASSO_IGNORE =
  "a, button, input, select, textarea, label, [role='dialog'], [data-teams-selection-bar]";

// Edit mode: pressing anywhere below the league tabs and moving draws a
// rectangle that adds every card it touches to the selection — on empty space
// and on unselected cards alike. Only selected cards are natively draggable
// (they carry the group), so a press elsewhere never waits on the browser's
// drag. Mouse only, so touch keeps scrolling the page.
function useLassoSelection({
  enabled,
  selectedIds,
  onChange,
}: {
  enabled: boolean;
  selectedIds: ReadonlySet<string>;
  onChange: (ids: ReadonlySet<string>) => void;
}) {
  const [box, setBox] = useState<LassoBox | null>(null);
  const latestRef = useRef({ selectedIds, onChange });

  useEffect(() => {
    latestRef.current = { selectedIds, onChange };
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function startsLasso(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const tabs = document.querySelector("[data-teams-tabs]");
      if (event.button !== 0 || !target || !tabs || target.closest(LASSO_IGNORE)) {
        return false;
      }

      const card = target.closest<HTMLElement>("[data-team-card-id]");
      if (card?.draggable) {
        return false;
      }

      const area = tabs.getBoundingClientRect();
      return (
        event.clientY > area.bottom &&
        event.clientX >= area.left &&
        event.clientX <= area.right
      );
    }

    function handleMouseDown(event: MouseEvent) {
      if (!startsLasso(event)) {
        return;
      }

      // Keeps the browser from selecting text or dragging a crest image.
      event.preventDefault();
      const startX = event.clientX + window.scrollX;
      const startY = event.clientY + window.scrollY;
      const initial = new Set(latestRef.current.selectedIds);
      let active = false;
      let lastKey = "";

      const handleMove = (moveEvent: MouseEvent) => {
        const currentX = moveEvent.clientX + window.scrollX;
        const currentY = moveEvent.clientY + window.scrollY;

        if (
          !active &&
          Math.hypot(currentX - startX, currentY - startY) < LASSO_THRESHOLD_PX
        ) {
          return;
        }
        active = true;

        // Page coordinates, so scrolling mid-gesture keeps the anchor in place.
        const left = Math.min(startX, currentX) - window.scrollX;
        const right = Math.max(startX, currentX) - window.scrollX;
        const top = Math.min(startY, currentY) - window.scrollY;
        const bottom = Math.max(startY, currentY) - window.scrollY;
        setBox({ left, top, width: right - left, height: bottom - top });

        const hits = new Set(initial);
        document
          .querySelectorAll<HTMLElement>("[data-team-card-id]")
          .forEach((card) => {
            const rect = card.getBoundingClientRect();
            if (
              rect.left < right &&
              rect.right > left &&
              rect.top < bottom &&
              rect.bottom > top &&
              card.dataset.teamCardId
            ) {
              hits.add(card.dataset.teamCardId);
            }
          });

        const key = Array.from(hits).sort().join(",");
        if (key !== lastKey) {
          lastKey = key;
          latestRef.current.onChange(hits);
        }
      };

      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        setBox(null);

        if (active) {
          // The press ended a lasso, not a click: the click that follows this
          // mouseup must not toggle the card under the cursor.
          const swallowClick = (clickEvent: MouseEvent) =>
            clickEvent.stopPropagation();
          window.addEventListener("click", swallowClick, { capture: true });
          window.setTimeout(() =>
            window.removeEventListener("click", swallowClick, { capture: true }),
          );
        }
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    }

    window.addEventListener("mousedown", handleMouseDown);
    return () => window.removeEventListener("mousedown", handleMouseDown);
  }, [enabled]);

  return box;
}

// The directory arrives once from the server (clubs/teams/leagues tables);
// league/query come from the URL so tab switches and search filter entirely on
// the client without another server round-trip.
export function TeamsWorkspaceClient({
  teams,
  responsibleContacts,
  leagues,
  defaultLeague,
  canManageTeams = false,
}: {
  teams: TeamDirectoryItem[];
  responsibleContacts: Record<string, TeamResponsibleContact | null>;
  leagues: TeamDirectoryTab[];
  defaultLeague: string;
  canManageTeams?: boolean;
}) {
  const {
    editing,
    selectedIds,
    setSelectedIds,
    toggleSelected,
    draggingIds,
    setDraggingIds,
  } = useTeamsEdit();
  const isEditing = editing && canManageTeams;
  const searchParams = useSearchParams();
  const activeLeague = resolveActiveTeamLeague(
    searchParams.get("league"),
    defaultLeague,
  );
  const query = searchParams.get("q") ?? "";

  const visibleTeams = useMemo(
    () => filterTeams(teams, { query, league: activeLeague }),
    [activeLeague, query, teams],
  );
  // Only what is on screen counts as selected: switching tab or searching
  // never carries hidden teams along.
  const selectedTeams = isEditing
    ? visibleTeams.filter((team) => selectedIds.has(team.id))
    : [];
  const visibleSelectedIds = new Set(selectedTeams.map((team) => team.id));
  const isLeagueView =
    Boolean(activeLeague) && activeLeague !== ARCHIVED_TEAM_LEAGUE;
  const lassoBox = useLassoSelection({
    enabled: isEditing,
    selectedIds: visibleSelectedIds,
    onChange: setSelectedIds,
  });

  const registeredCount = visibleTeams.filter((team) => Boolean(team.manager)).length;
  const incidentCount = visibleTeams.reduce(
    (sum, team) => sum + team.incident_count,
    0,
  );

  if (!visibleTeams.length) {
    return activeLeague === ARCHIVED_TEAM_LEAGUE && !query ? (
      <EmptyState
        title="No hay equipos archivados"
        description="Con Editar activo, seleccioná y arrastrá la tarjeta de un equipo que no juega ninguna liga esta temporada hasta la pestaña Archivados."
      />
    ) : (
      <EmptyState
        title="No encontramos equipos para este filtro"
        description="Prueba otro nombre, cambia de liga o registra un equipo nuevo desde el botón superior."
      />
    );
  }

  return (
    <>
      {lassoBox ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[150] rounded-md border border-[var(--accent)] bg-[var(--accent-soft)]/60"
          style={lassoBox}
        />
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {visibleTeams.map((team) => (
          <TeamCard
            key={team.id}
            team={team}
            activeLeague={
              activeLeague && activeLeague !== ARCHIVED_TEAM_LEAGUE
                ? activeLeague
                : undefined
            }
            responsibleContact={responsibleContacts[team.id] ?? null}
            canEdit={canManageTeams}
            selection={
              isEditing
                ? {
                    selected: visibleSelectedIds.has(team.id),
                    dimmed: draggingIds.has(team.id),
                    onToggle: () => toggleSelected(team.id),
                    onDragTeams: () => {
                      setDraggingIds(visibleSelectedIds);
                      return selectedTeams.map(toDragPayload);
                    },
                    onDragDone: () => setDraggingIds(NO_IDS),
                  }
                : undefined
            }
          />
        ))}
      </div>

      {selectedTeams.length ? (
        <TeamsSelectionBar
          teams={selectedTeams.map(toDragPayload)}
          leagues={leagues.filter((league) => league.value !== activeLeague)}
          fromLeague={isLeagueView ? activeLeague : null}
          canArchive={activeLeague !== ARCHIVED_TEAM_LEAGUE}
          onSelectAll={() =>
            setSelectedIds(new Set(visibleTeams.map((team) => team.id)))
          }
        />
      ) : null}

      <section className="panel-surface grid gap-4 border border-[var(--border)] bg-white p-6 sm:grid-cols-2 xl:grid-cols-4">
        <div className="text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--n-400)]">
            Equipos visibles
          </p>
          <p className="font-[family-name:var(--font-oswald)] mt-2 text-3xl font-bold text-[var(--foreground)]">
            {visibleTeams.length}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--n-400)]">
            Ligas activas
          </p>
          <p className="font-[family-name:var(--font-oswald)] mt-2 text-3xl font-bold text-[var(--foreground)]">
            {new Set(visibleTeams.map((team) => team.competition)).size}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--n-400)]">
            Incidencias
          </p>
          <p className="font-[family-name:var(--font-oswald)] mt-2 text-3xl font-bold text-[var(--accent)]">
            {incidentCount}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--n-400)]">
            Con responsable
          </p>
          <p className="font-[family-name:var(--font-oswald)] mt-2 text-3xl font-bold text-[var(--foreground)]">
            {registeredCount}
          </p>
        </div>
      </section>
    </>
  );
}
