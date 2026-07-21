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
import { buildTeamDirectoryTabs, getTeamDirectory } from "@/lib/data/teams";
import { getSettingsSnapshot } from "@/lib/settings";
import type { TeamDirectoryItem } from "@/lib/team-directory";
import { resolveTeamLogoMap } from "@/lib/team-logos";

// The directory is read once from the DB (clubs/teams/leagues); league tabs and
// search still filter entirely on the client (history.pushState soft updates) —
// no searchParams read here, so tab switches and keystrokes never trigger a
// server render. The people contact list streams behind Suspense.
export default async function TeamsPage() {
  const [user, settings] = await Promise.all([
    getUserContext(),
    getSettingsSnapshot(),
  ]);
  const teams = await getTeamDirectory(user);
  const canManageTeams = user.canEdit && !isCollaboratorLimitedRole(user.role);
  const tabs = buildTeamDirectoryTabs(teams);

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
            contextCount={teams.length}
            contextRef={{ section: "teams" }}
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

      <TeamsLeagueTabs tabs={tabs} totalCount={teams.length} />

      <Suspense fallback={<TeamsDirectorySkeleton />}>
        <TeamsDirectoryRegion
          user={user}
          teams={teams}
          canManageTeams={canManageTeams}
        />
      </Suspense>
    </div>
  );
}

async function TeamsDirectoryRegion({
  user,
  teams,
  canManageTeams,
}: {
  user: UserContext;
  teams: TeamDirectoryItem[];
  canManageTeams: boolean;
}) {
  const people = user.userId ? await getPeopleContactList(user) : [];
  // Pre-resolve crests for the whole directory so cards paint logos on first
  // paint regardless of the client-side league filter; teams without a bundled
  // crest still fall back to fetch.
  const teamLogoMap = resolveTeamLogoMap(
    teams.map((team) => ({
      teamName: team.official_name,
      competition: team.competition,
    })),
  );

  return (
    <TeamLogoResolutionProvider value={teamLogoMap}>
      <TeamsWorkspaceClient
        teams={teams}
        people={people}
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
