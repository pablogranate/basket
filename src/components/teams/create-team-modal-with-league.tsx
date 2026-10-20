"use client";

import { useSearchParams } from "next/navigation";

import { CreateTeamModal } from "@/components/teams/create-team-modal-lazy";
import { ARCHIVED_TEAM_LEAGUE } from "@/lib/team-directory";

// League tabs switch client-side (history.pushState), so the default
// competition must be read from the live URL, not from a server prop.
export function CreateTeamModalWithLeague({ canEdit }: { canEdit: boolean }) {
  const searchParams = useSearchParams();
  const leagueParam = searchParams.get("league")?.trim() ?? "";
  const activeLeague = leagueParam === ARCHIVED_TEAM_LEAGUE ? "" : leagueParam;

  return <CreateTeamModal canEdit={canEdit} defaultCompetition={activeLeague} />;
}
