"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState, type RefObject } from "react";

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

// Edit mode: pressing on empty grid space and dragging draws a rectangle that
// adds every card it touches to the selection. Mouse only, so touch keeps
// scrolling the page (touch selects card by card).
function useLassoSelection({
  containerRef,
  enabled,
  selectedIds,
  onChange,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  selectedIds: ReadonlySet<string>;
  onChange: (ids: ReadonlySet<string>) => void;
}) {
  const [box, setBox] = useState<LassoBox | null>(null);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const container = containerRef.current;
    if (
      !enabled ||
      !container ||
      event.button !== 0 ||
      event.pointerType !== "mouse" ||
      (event.target as HTMLElement).closest("[data-team-card-id]")
    ) {
      return;
    }

    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const initial = new Set(selectedIds);
    let lastKey = "";

    const handleMove = (moveEvent: PointerEvent) => {
      const left = Math.min(startX, moveEvent.clientX);
      const right = Math.max(startX, moveEvent.clientX);
      const top = Math.min(startY, moveEvent.clientY);
      const bottom = Math.max(startY, moveEvent.clientY);
      const rect = container.getBoundingClientRect();
      setBox({
        left: left - rect.left,
        top: top - rect.top,
        width: right - left,
        height: bottom - top,
      });

      const hits = new Set(initial);
      container
        .querySelectorAll<HTMLElement>("[data-team-card-id]")
        .forEach((card) => {
          const cardRect = card.getBoundingClientRect();
          if (
            cardRect.left < right &&
            cardRect.right > left &&
            cardRect.top < bottom &&
            cardRect.bottom > top &&
            card.dataset.teamCardId
          ) {
            hits.add(card.dataset.teamCardId);
          }
        });

      const key = Array.from(hits).sort().join(",");
      if (key !== lastKey) {
        lastKey = key;
        onChange(hits);
      }
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      setBox(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  }

  return { box, onPointerDown };
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
  const gridRef = useRef<HTMLDivElement>(null);
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
  const lasso = useLassoSelection({
    containerRef: gridRef,
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
        description="Con Editar activo, arrastrá la tarjeta de un equipo que no juega ninguna liga esta temporada hasta la pestaña Archivados."
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
      <div
        ref={gridRef}
        onPointerDown={lasso.onPointerDown}
        className="relative grid gap-4 lg:grid-cols-2 xl:grid-cols-4"
      >
        {lasso.box ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-30 rounded-md border border-[var(--accent)] bg-[var(--accent-soft)]/60"
            style={lasso.box}
          />
        ) : null}
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
                      const group = visibleSelectedIds.has(team.id)
                        ? selectedTeams
                        : [team];
                      setDraggingIds(new Set(group.map((item) => item.id)));
                      return group.map(toDragPayload);
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
