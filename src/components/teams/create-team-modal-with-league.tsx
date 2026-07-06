"use client";

import { useSearchParams } from "next/navigation";

import { CreateTeamModal } from "@/components/teams/create-team-modal-lazy";

// League tabs switch client-side (history.pushState), so the default
// competition must be read from the live URL, not from a server prop.
export function CreateTeamModalWithLeague({ canEdit }: { canEdit: boolean }) {
  const searchParams = useSearchParams();
  const activeLeague = searchParams.get("league")?.trim() ?? "";

  return <CreateTeamModal canEdit={canEdit} defaultCompetition={activeLeague} />;
}
