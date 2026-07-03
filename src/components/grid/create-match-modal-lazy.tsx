"use client";

import dynamic from "next/dynamic";

// Lazy boundary: the create/edit match modal (~70KB) is hidden until a user
// opens it, so it ships as its own async chunk instead of in the initial /grid
// bundle. Imported by both grid-table and match-card-actions.
export const CreateMatchModal = dynamic(
  () =>
    import("@/components/grid/create-match-modal").then(
      (mod) => mod.CreateMatchModal,
    ),
  { ssr: false },
);
