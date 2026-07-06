import { Suspense } from "react";

import { SectionAiAssistant } from "@/components/ai/section-ai-assistant";
import { CreateTeamModalWithLeague } from "@/components/teams/create-team-modal-with-league";
import { SectionPageHeader } from "@/components/layout/section-page-header";
import { TeamsLeagueTabs } from "@/components/teams/teams-league-tabs";
import { TeamsSearchField } from "@/components/teams/teams-search-field";
import { TeamsWorkspaceClient } from "@/components/teams/teams-workspace-client";
import { TeamLogoResolutionProvider } from "@/components/team-logo-resolution-context";
import { getUserContext } from "@/lib/auth";
import { SECTION_COPY } from "@/lib/copy";
import { isCollaboratorLimitedRole } from "@/lib/constants";
import type { UserContext } from "@/lib/auth";
import { getPeopleContactList } from "@/lib/data/dashboard";
import { getSettingsSnapshot } from "@/lib/settings";
import { TEAM_DIRECTORY } from "@/lib/team-directory";
import { resolveTeamLogoMap } from "@/lib/team-logos";

// League tabs and search filter the static in-code catalog entirely on the
// client (history.pushState soft updates) — no searchParams read here, so tab
// switches and keystrokes never trigger a server render. The only server data
// is the people contact list, streamed behind Suspense.
export default async function TeamsPage() {
  // Settings is independent of the user — resolve both concurrently.
  const [user, settings] = await Promise.all([
    getUserContext(),
    getSettingsSnapshot(),
  ]);
  const canManageTeams = user.canEdit && !isCollaboratorLimitedRole(user.role);
  const aiContext = TEAM_DIRECTORY.map((team) => ({
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
      <SectionPageHeader
        title={SECTION_COPY.teams.title}
        description={SECTION_COPY.teams.description}
        actions={
          <>
          <TeamsSearchField className="w-full md:min-w-[22rem] md:flex-1" />

          <SectionAiAssistant
            section="Equipos"
            title="Consulta el directorio visible"
            description="Pregunta por clubes, responsables, estadios, ligas o incidencias usando solo el directorio visible en esta pantalla."
            placeholder="Ej. ¿Qué equipos de Liga Argentina tienen responsable y cuántas incidencias acumulan?"
            contextLabel="Equipos del directorio"
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

          <CreateTeamModalWithLeague canEdit={canManageTeams} />
          </>
        }
      />

      <TeamsLeagueTabs />

      <Suspense fallback={<TeamsDirectorySkeleton />}>
        <TeamsDirectoryRegion user={user} canManageTeams={canManageTeams} />
      </Suspense>
    </div>
  );
}

async function TeamsDirectoryRegion({
  user,
  canManageTeams,
}: {
  user: UserContext;
  canManageTeams: boolean;
}) {
  const people = user.userId ? await getPeopleContactList(user) : [];
  // Pre-resolve crests for the whole catalog so cards paint logos on first
  // paint regardless of the client-side league filter; client-only extras
  // (locally created teams) still fall back to fetch.
  const teamLogoMap = resolveTeamLogoMap(
    TEAM_DIRECTORY.map((team) => ({
      teamName: team.official_name,
      competition: team.competition,
    })),
  );

  return (
    <TeamLogoResolutionProvider value={teamLogoMap}>
      <TeamsWorkspaceClient people={people} canManageTeams={canManageTeams} />
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
