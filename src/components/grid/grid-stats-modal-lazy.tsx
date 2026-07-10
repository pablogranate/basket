"use client";

import dynamic from "next/dynamic";

// Lazy boundary: the statistics modal (tables + fetch logic) only ships when a
// user opens it, keeping the initial /grid bundle unchanged.
export const GridStatsModal = dynamic(
  () =>
    import("@/components/grid/grid-stats-modal").then(
      (mod) => mod.GridStatsModal,
    ),
  { ssr: false },
);
