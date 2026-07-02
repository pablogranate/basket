"use client";

import { useEffect, useMemo, useState } from "react";

import { TeamCard } from "@/components/teams/team-card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  buildTeamResponsibleLookup,
  getTeamResponsibleContact,
} from "@/lib/team-responsibles";
import type { TeamDirectoryItem } from "@/lib/team-directory";
import type { PersonListItem } from "@/lib/types";
import {
  CUSTOM_TEAMS_CHANGED_EVENT,
  readCustomTeams,
} from "@/lib/teams-local-storage";

function filterCustomTeams(
  teams: TeamDirectoryItem[],
  params: { query?: string; league?: string },
) {
  const query = params.query?.trim().toLowerCase() ?? "";
  const league = params.league?.trim() ?? "";

  return teams.filter((team) => {
    if (league && !team.competition.split("/").map((part) => part.trim()).includes(league)) {
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

export function TeamsWorkspaceClient({
  initialTeams,
  people,
  activeLeague,
  query,
  canManageTeams = false,
}: {
  initialTeams: TeamDirectoryItem[];
  people: PersonListItem[];
  activeLeague: string;
  query: string;
  canManageTeams?: boolean;
}) {
  const [customTeams, setCustomTeams] = useState<TeamDirectoryItem[]>([]);

  useEffect(() => {
    const syncTeams = () => setCustomTeams(readCustomTeams());

    syncTeams();
    window.addEventListener("storage", syncTeams);
    window.addEventListener(CUSTOM_TEAMS_CHANGED_EVENT, syncTeams);

    return () => {
      window.removeEventListener("storage", syncTeams);
      window.removeEventListener(CUSTOM_TEAMS_CHANGED_EVENT, syncTeams);
    };
  }, []);

  const visibleCustomTeams = useMemo(
    () => filterCustomTeams(customTeams, { query, league: activeLeague }),
    [activeLeague, customTeams, query],
  );

  const mergedTeams = useMemo(() => {
    const customById = new Map(visibleCustomTeams.map((team) => [team.id, team]));
    const nextTeams = initialTeams.map((team) => customById.get(team.id) ?? team);
    const seenIds = new Set(nextTeams.map((team) => team.id));

    visibleCustomTeams.forEach((team) => {
      if (!seenIds.has(team.id)) {
        nextTeams.push(team);
      }
    });

    return nextTeams;
  }, [initialTeams, visibleCustomTeams]);

  const responsibleLookup = useMemo(
    () => buildTeamResponsibleLookup(people),
    [people],
  );

  const registeredCount = mergedTeams.filter((team) => Boolean(team.manager)).length;
  const incidentCount = mergedTeams.reduce(
    (sum, team) => sum + team.incident_count,
    0,
  );

  if (!mergedTeams.length) {
    return (
      <EmptyState
        title="No encontramos equipos para este filtro"
        description="Prueba otro nombre, cambia de liga o registra un equipo nuevo desde el botón superior."
      />
    );
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {mergedTeams.map((team) => (
          <TeamCard
            key={team.id}
            team={team}
            activeLeague={activeLeague || undefined}
            responsibleContact={getTeamResponsibleContact(
              team.official_name,
              team.manager,
              responsibleLookup,
            )}
            canEdit={canManageTeams}
          />
        ))}
      </div>

      <section className="panel-surface grid gap-4 border border-[var(--border)] bg-white p-6 sm:grid-cols-2 xl:grid-cols-4">
        <div className="text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--n-400)]">
            Equipos visibles
          </p>
          <p className="font-[family-name:var(--font-oswald)] mt-2 text-3xl font-bold text-[var(--foreground)]">
            {mergedTeams.length}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--n-400)]">
            Ligas activas
          </p>
          <p className="font-[family-name:var(--font-oswald)] mt-2 text-3xl font-bold text-[var(--foreground)]">
            {new Set(mergedTeams.map((team) => team.competition)).size}
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
