"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { TeamCard } from "@/components/teams/team-card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  buildTeamResponsibleLookup,
  getTeamResponsibleContact,
  type TeamResponsiblePerson,
} from "@/lib/team-responsibles";
import type { TeamDirectoryItem } from "@/lib/team-directory";
import { splitTeamCompetitions } from "@/lib/team-directory";

function filterTeams(
  teams: TeamDirectoryItem[],
  params: { query?: string; league?: string },
) {
  const query = params.query?.trim().toLowerCase() ?? "";
  const league = params.league?.trim() ?? "";

  return teams.filter((team) => {
    if (league && !splitTeamCompetitions(team.competition).includes(league)) {
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

// The directory arrives once from the server (clubs/teams/leagues tables);
// league/query come from the URL so tab switches and search filter entirely on
// the client without another server round-trip.
export function TeamsWorkspaceClient({
  teams,
  people,
  canManageTeams = false,
}: {
  teams: TeamDirectoryItem[];
  people: TeamResponsiblePerson[];
  canManageTeams?: boolean;
}) {
  const searchParams = useSearchParams();
  const activeLeague = searchParams.get("league")?.trim() ?? "";
  const query = searchParams.get("q") ?? "";

  const visibleTeams = useMemo(
    () => filterTeams(teams, { query, league: activeLeague }),
    [activeLeague, query, teams],
  );

  const responsibleLookup = useMemo(
    () => buildTeamResponsibleLookup(people),
    [people],
  );

  const registeredCount = visibleTeams.filter((team) => Boolean(team.manager)).length;
  const incidentCount = visibleTeams.reduce(
    (sum, team) => sum + team.incident_count,
    0,
  );

  if (!visibleTeams.length) {
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
        {visibleTeams.map((team) => (
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
