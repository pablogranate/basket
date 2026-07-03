"use client";

import dynamic from "next/dynamic";

// Lazy boundary: the create/edit person modal is hidden until opened, so it
// ships as its own async chunk. Imported by the people page (a server component
// — the "use client" here keeps `ssr: false` legal).
export const CreatePersonModal = dynamic(
  () =>
    import("@/components/people/create-person-modal").then(
      (mod) => mod.CreatePersonModal,
    ),
  { ssr: false },
);
