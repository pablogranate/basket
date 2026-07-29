import { Suspense } from "react";

import { LazySectionAiAssistant } from "@/components/ai/section-ai-assistant-lazy";
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
import {
  buildTeamResponsibleLookup,
  getTeamResponsibleContact,
  type TeamResponsibleContact,
} from "@/lib/team-responsibles";

// The directory is read once from the DB (clubs/teams/leagues); league tabs and
// search still filter entirely on the client (history.pushState soft updates) —
// no searchParams read here, so tab switches and keystrokes never trigger a
// server render.
//
// The directory read is started but never awaited here: the header (whose
// description paragraph is this page's LCP element) has to reach the browser in
// the first flushed chunk. Everything that needs the directory — the tabs, the
// assistant's context count, the cards — awaits the same promise behind its own
// Suspense boundary.
export default async function TeamsPage() {
  const [user, settings] = await Promise.all([
    getUserContext(),
    getSettingsSnapshot(),
  ]);
  const canManageTeams = user.canEdit && !isCollaboratorLimitedRole(user.role);
  const teamsPromise = getTeamDirectory(user);

  return (
    <div className="space-y-10">
      <SectionPageHeader
        title={SECTION_COPY.teams.title}
        description={SECTION_COPY.teams.description}
        actions={
          <>
          <TeamsSearchField className="w-full md:min-w-[22rem] md:flex-1" />

          <Suspense fallback={<TeamsAiAssistantPlaceholder />}>
            <TeamsAiAssistantRegion
              teamsPromise={teamsPromise}
              hasGeminiKey={settings.hasGeminiKey}
            />
          </Suspense>

          <CreateTeamModalWithLeague canEdit={canManageTeams} />
          </>
        }
      />

      <Suspense fallback={<TeamsLeagueTabsSkeleton />}>
        <TeamsLeagueTabsRegion teamsPromise={teamsPromise} />
      </Suspense>

      <Suspense fallback={<TeamsDirectorySkeleton />}>
        <TeamsDirectoryRegion
          user={user}
          teamsPromise={teamsPromise}
          canManageTeams={canManageTeams}
        />
      </Suspense>
    </div>
  );
}

async function TeamsAiAssistantRegion({
  teamsPromise,
  hasGeminiKey,
}: {
  teamsPromise: Promise<TeamDirectoryItem[]>;
  hasGeminiKey: boolean;
}) {
  const teams = await teamsPromise;

  return (
    <LazySectionAiAssistant
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
      hasGeminiKey={hasGeminiKey}
      buttonVariant="icon"
    />
  );
}

async function TeamsLeagueTabsRegion({
  teamsPromise,
}: {
  teamsPromise: Promise<TeamDirectoryItem[]>;
}) {
  const teams = await teamsPromise;

  return (
    <TeamsLeagueTabs
      tabs={buildTeamDirectoryTabs(teams)}
      totalCount={teams.length}
    />
  );
}

async function TeamsDirectoryRegion({
  user,
  teamsPromise,
  canManageTeams,
}: {
  user: UserContext;
  teamsPromise: Promise<TeamDirectoryItem[]>;
  canManageTeams: boolean;
}) {
  const [teams, people] = await Promise.all([
    teamsPromise,
    user.userId ? getPeopleContactList(user) : Promise.resolve([]),
  ]);
  // The responsible of a team depends only on the directory and the people
  // table, never on the client-side league/query filter — so it is resolved
  // here instead of shipping the whole people list (phones, emails, notes,
  // coverage) to the browser just to rebuild the lookup during hydration.
  const responsibleLookup = buildTeamResponsibleLookup(people);
  // Pre-resolve crests for the whole directory so cards paint logos on first
  // paint regardless of the client-side league filter; teams without a bundled
  // crest still fall back to fetch.
  const teamLogoMap = resolveTeamLogoMap(
    teams.map((team) => ({
      teamName: team.official_name,
      competition: team.competition,
    })),
  );

  const responsibleContacts: Record<string, TeamResponsibleContact | null> =
    Object.fromEntries(
      teams.map((team) => [
        team.id,
        getTeamResponsibleContact(
          team.official_name,
          team.manager,
          responsibleLookup,
        ),
      ]),
    );

  return (
    <TeamLogoResolutionProvider value={teamLogoMap}>
      <TeamsWorkspaceClient
        teams={teams}
        responsibleContacts={responsibleContacts}
        canManageTeams={canManageTeams}
      />
    </TeamLogoResolutionProvider>
  );
}

// The assistant trigger needs a live click handler, so the placeholder is just
// its 52px footprint — enough to keep the header actions from reflowing when the
// real button streams in.
function TeamsAiAssistantPlaceholder() {
  return <div className="size-[52px] shrink-0" aria-hidden="true" />;
}

function TeamsLeagueTabsSkeleton() {
  return (
    <div
      className="h-[45px] border-b border-[var(--accent-border)]"
      aria-hidden="true"
    />
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
