// Shape of the teams-sync confirmation modal's diff. Lives outside the
// `server-only` loader so the client modal can import the type.

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
