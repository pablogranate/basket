// Shape of the confirmation modal's diff. Lives outside `people/sync.ts` so the
// client modal can import the type without pulling in a `server-only` module.

// Club names from the "Listas" tab that the portal does not know yet. `created`
// are unambiguous new teams; `ambiguous` look like a club already loaded and
// need the operator to say whether they are the same one.
export type TeamsSyncPlanPreview = {
  created: string[];
  ambiguous: {
    name: string;
    candidates: { clubId: string; name: string }[];
  }[];
};

// What the operator resolved in the modal, carried into the run so the apply
// step creates exactly what was approved on screen.
export type TeamsSyncDecisions = {
  create: string[];
  aliases: { alias: string; clubId: string }[];
};

export type PeopleSyncPreview = {
  created: string[];
  updated: { name: string; changes: string[]; restored: boolean }[];
  deleted: string[];
  protected: string[];
  // Portal people the tab does not list but the sync will not remove: without a
  // correo they were never sheet-managed, so the tab cannot speak for them.
  withoutEmail: string[];
  // Rows the tab does list but the sync ignores, because "Correo" is empty.
  skippedNoEmail: string[];
  unchanged: number;
  skippedRows: number;
  warnings: string[];
  teams: TeamsSyncPlanPreview;
  teamsError: string | null;
};
