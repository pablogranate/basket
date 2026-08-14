import { Suspense } from "react";

import { CreateTeamModalWithLeague } from "@/components/teams/create-team-modal-with-league";
import { SectionPageHeader } from "@/components/layout/section-page-header";
import { TeamCardIconSprite } from "@/components/teams/team-card-icon-sprite";
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
// cards — awaits the same promise behind its own Suspense boundary.
export default async function TeamsPage() {
  const user = await getUserContext();
  const canManageTeams = user.canEdit && !isCollaboratorLimitedRole(user.role);
  const teamsPromise = getTeamDirectory(user);

  return (
    <>
      {/* Outside every Suspense boundary on purpose: the cards reference these
          symbols with <use href="#…">, which resolves against the live document,
          so the defs have to be in the first flushed chunk. Kept out of the
          space-y-10 stack so it does not become a spacing sibling. */}
      <TeamCardIconSprite />

    <div className="space-y-10">
      <SectionPageHeader
        title={SECTION_COPY.teams.title}
        description={SECTION_COPY.teams.description}
        actions={
          <>
          <TeamsSearchField className="w-full md:min-w-[22rem] md:flex-1" />

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
    </>
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
