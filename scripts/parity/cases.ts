import { makeCtx, type Samples } from "./lib";

export type CasePair = {
  name: string;
  oldRun: () => Promise<unknown>;
  newRun: () => Promise<unknown>;
};

// Old (supabase-js) vs new (Drizzle) run simultaneously against the same DB, so
// actively-written tables (grid_sync_runs, notification_logs) cannot drift
// between the two reads.
export async function buildCasePairs(s: Samples): Promise<CasePair[]> {
  const oldMod = {
    dashboard: await import("./baseline/dashboard"),
    collaborators: await import("./baseline/collaborators"),
    teams: await import("./baseline/teams"),
    announcements: await import("./baseline/announcements"),
    platformAccess: await import("./baseline/platform-access"),
    linkedPerson: await import("./baseline/linked-person"),
    syncLogs: await import("./baseline/sync-logs"),
    notificationLogs: await import("./baseline/notification-logs"),
  };
  const newMod = {
    dashboard: await import("@/lib/data/dashboard"),
    collaborators: await import("@/lib/data/collaborators"),
    teams: await import("@/lib/data/teams"),
    announcements: await import("@/lib/data/announcements"),
    platformAccess: await import("@/lib/data/platform-access"),
    linkedPerson: await import("@/lib/data/linked-person"),
    syncLogs: await import("@/lib/data/sync-logs"),
    notificationLogs: await import("@/lib/data/notification-logs"),
  };

  const admin = makeCtx({ role: "admin", email: "parity-admin@basquetpass.tv" });
  const collab = makeCtx({
    role: "collaborator",
    email: s.personEmail,
    profileName: s.personName,
  });
  const tz = "America/Bogota";
  const baseFilters = {
    view: "day" as const,
    date: s.gridDate,
    q: "",
    league: "",
    mode: "",
    status: "",
    owner: "",
    timezone: tz,
  };

  // Each entry maps a case name to how to invoke it on a given module set.
  const specs: Array<{ name: string; call: (m: typeof oldMod) => Promise<unknown> }> = [
    { name: "grid-day", call: (m) => m.dashboard.getGridData(admin, baseFilters) },
    {
      name: "grid-month",
      call: (m) => m.dashboard.getGridData(admin, { ...baseFilters, view: "month" }),
    },
    {
      name: "grid-query-filter",
      call: (m) =>
        m.dashboard.getGridData(admin, {
          ...baseFilters,
          view: "month",
          q: s.personName.slice(0, 3),
        }),
    },
    {
      name: "grid-league-filter",
      call: (m) =>
        m.dashboard.getGridData(admin, {
          ...baseFilters,
          view: "month",
          league: s.competition,
        }),
    },
    { name: "match-detail", call: (m) => m.dashboard.getMatchDetailData(admin, s.matchId) },
    { name: "people-data", call: (m) => m.dashboard.getPeopleData(admin) },
    { name: "people-contact-list", call: (m) => m.dashboard.getPeopleContactList(admin) },
    { name: "roles-data", call: (m) => m.dashboard.getRolesData(admin) },
    {
      name: "collaborator-day",
      call: (m) =>
        m.collaborators.getCollaboratorDayData(collab, {
          email: s.personEmail,
          profileName: s.personName,
        }),
    },
    {
      name: "collaborator-match",
      call: (m) =>
        m.collaborators.getCollaboratorMatchData(collab, {
          email: s.personEmail,
          profileName: s.personName,
          matchId: s.matchId,
        }),
    },
    { name: "team-directory", call: (m) => m.teams.getTeamDirectory(admin) },
    { name: "team-by-slug", call: (m) => m.teams.getTeamFromDbBySlug(admin, s.teamSlug) },
    { name: "announcement-active", call: (m) => m.announcements.getActiveAnnouncement(admin) },
    { name: "announcement-latest", call: (m) => m.announcements.getLatestAnnouncement(admin) },
    {
      name: "platform-access-role",
      call: (m) => m.platformAccess.getPlatformAccessRole("parity-admin@basquetpass.tv"),
    },
    {
      name: "platform-access-has",
      call: (m) => m.platformAccess.personHasPlatformAccess(s.personEmail),
    },
    {
      name: "linked-person-by-name",
      call: (m) =>
        m.linkedPerson.findLinkedPerson({ email: null, profileName: s.personName }),
    },
    { name: "sync-logs", call: (m) => m.syncLogs.getSyncLogs(admin, { page: 1 }) },
    {
      name: "notification-logs",
      call: (m) => m.notificationLogs.getNotificationLogs(admin, { page: 1 }),
    },
  ];

  return specs.map((spec) => ({
    name: spec.name,
    oldRun: () => spec.call(oldMod),
    newRun: () => spec.call(newMod as unknown as typeof oldMod),
  }));
}
