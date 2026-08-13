// Shape of the confirmation modal's diff. Lives outside `people/sync.ts` so the
// client modal can import the type without pulling in a `server-only` module.
export type PeopleSyncPreview = {
  created: string[];
  updated: { name: string; changes: string[]; restored: boolean }[];
  deleted: string[];
  protected: string[];
  unchanged: number;
  skippedRows: number;
  warnings: string[];
};
