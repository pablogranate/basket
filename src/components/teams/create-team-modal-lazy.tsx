"use client";

import dynamic from "next/dynamic";

// Lazy boundary: the create/edit team modal is hidden until opened, so it ships
// as its own async chunk. Imported by team-card and the teams page (a server
// component — the "use client" here keeps `ssr: false` legal).
export const CreateTeamModal = dynamic(
  () =>
    import("@/components/teams/create-team-modal").then(
      (mod) => mod.CreateTeamModal,
    ),
  { ssr: false },
);
