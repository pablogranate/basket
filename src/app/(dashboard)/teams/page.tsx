import Link from "next/link";
import { Suspense } from "react";

import { SectionAiAssistant } from "@/components/ai/section-ai-assistant";
import { CreateTeamModal } from "@/components/teams/create-team-modal-lazy";
import { PageCanvasTone } from "@/components/layout/page-canvas-tone";
import { SectionPageHeader } from "@/components/layout/section-page-header";
import { TeamsWorkspaceClient } from "@/components/teams/teams-workspace-client";
import { TeamLogoResolutionProvider } from "@/components/team-logo-resolution-context";
import { ToolbarSearchField } from "@/components/ui/toolbar-search-field";
import { getUserContext } from "@/lib/auth";
import { SECTION_COPY } from "@/lib/copy";
import { isCollaboratorLimitedRole } from "@/lib/constants";
import type { UserContext } from "@/lib/auth";
import { getPeopleContactList } from "@/lib/data/dashboard";
import { getSettingsSnapshot } from "@/lib/settings";
import {
  getTeamLeagueAccentColor,
  getTeamLeagueCanvasTone,
  getTeamDirectoryData,
  getTeamDirectoryTabs,
  TEAM_DIRECTORY,
  type TeamDirectoryItem,
} from "@/lib/team-directory";
import { resolveTeamLogoMap } from "@/lib/team-logos";
import { cn } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readSearchValue(
  value: string | string[] | undefined,
  fallback = "",
) {
  return typeof value === "string" ? value : fallback;
}

function buildTeamsHref(
  params: Record<string, string | string[] | undefined>,
  updates: Record<string, string | undefined>,
) {
  const search = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(params)) {
    if (typeof rawValue === "string" && rawValue) {
      search.set(key, rawValue);
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (!value) {
      search.delete(key);
      continue;
    }

    search.set(key, value);
  }

  const query = search.toString();
  return query ? `/teams?${query}` : "/teams";
}

export default async function TeamsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const user = await getUserContext();
  const query = readSearchValue(resolvedSearchParams.q);
  const activeLeague = readSearchValue(resolvedSearchParams.league);
  const teams = getTeamDirectoryData({ query, league: activeLeague });
  const canManageTeams = user.canEdit && !isCollaboratorLimitedRole(user.role);
  const settings = await getSettingsSnapshot();
  const tabs = getTeamDirectoryTabs();
  const leagueAccent = activeLeague
    ? getTeamLeagueAccentColor(activeLeague)
    : null;
  const leagueCanvasTone = activeLeague
    ? getTeamLeagueCanvasTone(activeLeague)
    : null;
  const aiContext = teams.map((team) => ({
    equipo: team.official_name,
    liga: team.competition,
    estadio: team.stadium ?? "Sin estadio cargado",
    responsable: team.manager ?? "Sin responsable",
    web: team.website ?? "",
    instagram: team.instagram ?? "",
    enlace_oficial: team.official_url ?? "",
    incidencias: team.incident_count,
  }));

  return (
    <div className="space-y-10">
      <PageCanvasTone tone={leagueCanvasTone} />

      <SectionPageHeader
        title={SECTION_COPY.teams.title}
        description={SECTION_COPY.teams.description}
        actions={
          <>
          <ToolbarSearchField
            action="/teams"
            defaultValue={query}
            placeholder="Buscar equipo, liga o estadio..."
            className="w-full md:min-w-[22rem] md:flex-1"
          >
            {activeLeague ? (
              <input type="hidden" name="league" value={activeLeague} />
            ) : null}
          </ToolbarSearchField>

          <SectionAiAssistant
            section="Equipos"
            title="Consulta el directorio visible"
            description="Pregunta por clubes, responsables, estadios, ligas o incidencias usando solo el directorio visible en esta pantalla."
            placeholder="Ej. ¿Qué equipos de Liga Argentina tienen responsable y cuántas incidencias acumulan?"
            contextLabel="Equipos visibles del directorio actual"
            context={aiContext}
            guidance="Prioriza equipo, liga, estadio, responsable, enlaces oficiales e incidencias. Si el usuario pide comparar equipos, responde en bullets claros."
            examples={[
              "¿Qué equipos no tienen responsable?",
              "¿Qué estadio tiene Atenas de Córdoba?",
              "¿Qué clubes acumulan más incidencias?",
            ]}
            hasGeminiKey={settings.hasGeminiKey}
            buttonVariant="icon"
          />

          <CreateTeamModal
            canEdit={canManageTeams}
            defaultCompetition={activeLeague}
          />
          </>
        }
      />

      <div className="flex items-center gap-3 border-b border-[var(--accent-border)]">
        <div className="flex min-w-0 flex-1 overflow-x-auto">
          <Link
            href={buildTeamsHref(resolvedSearchParams, { league: undefined })}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-6 py-3 text-sm font-bold transition",
              !activeLeague
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--n-600)] hover:text-[var(--accent)]",
            )}
          >
            Todos ({TEAM_DIRECTORY.length})
          </Link>
          {tabs.map((tab) => (
            <Link
              key={tab.value}
              href={buildTeamsHref(resolvedSearchParams, { league: tab.value })}
              style={
                activeLeague === tab.value && leagueAccent
                  ? {
                      borderColor: leagueAccent,
                      color: leagueAccent,
                    }
                  : undefined
              }
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-6 py-3 text-sm font-bold transition",
                activeLeague === tab.value
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[var(--n-600)] hover:text-[var(--accent)]",
              )}
            >
              {tab.label} ({tab.count})
            </Link>
          ))}
        </div>

      </div>

      <Suspense fallback={<TeamsDirectorySkeleton />}>
        <TeamsDirectoryRegion
          user={user}
          initialTeams={teams}
          activeLeague={activeLeague}
          query={query}
          canManageTeams={canManageTeams}
        />
      </Suspense>
    </div>
  );
}

async function TeamsDirectoryRegion({
  user,
  initialTeams,
  activeLeague,
  query,
  canManageTeams,
}: {
  user: UserContext;
  initialTeams: TeamDirectoryItem[];
  activeLeague: string;
  query: string;
  canManageTeams: boolean;
}) {
  const people = user.userId ? await getPeopleContactList(user) : [];
  // Pre-resolve crests for the server-known teams so cards paint logos on first
  // paint; client-only extras (locally created teams) still fall back to fetch.
  const teamLogoMap = resolveTeamLogoMap(
    initialTeams.map((team) => ({
      teamName: team.official_name,
      competition: team.competition,
    })),
  );

  return (
    <TeamLogoResolutionProvider value={teamLogoMap}>
      <TeamsWorkspaceClient
        initialTeams={initialTeams}
        people={people}
        activeLeague={activeLeague}
        query={query}
        canManageTeams={canManageTeams}
      />
    </TeamLogoResolutionProvider>
  );
}

function TeamsDirectorySkeleton() {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-44 animate-pulse rounded-[var(--panel-radius)] border border-[var(--border)] bg-[var(--surface)]"
        />
      ))}
    </div>
  );
}
