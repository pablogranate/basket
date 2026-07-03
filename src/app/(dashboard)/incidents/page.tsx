import { IncidentsWorkspace } from "@/components/incidents/incidents-workspace";
import { TeamLogoResolutionProvider } from "@/components/team-logo-resolution-context";
import { INCIDENT_DIRECTORY } from "@/lib/incidents";
import { getSettingsSnapshot } from "@/lib/settings";
import { matchLabelLogoPairs } from "@/lib/match-label";
import { resolveTeamLogoMap } from "@/lib/team-logos";

export default async function IncidentsPage() {
  const settings = await getSettingsSnapshot();
  const teamLogoMap = resolveTeamLogoMap(
    INCIDENT_DIRECTORY.flatMap((incident) =>
      matchLabelLogoPairs(incident.matchLabel, incident.competition),
    ),
  );

  return (
    <TeamLogoResolutionProvider value={teamLogoMap}>
      <IncidentsWorkspace
        incidents={INCIDENT_DIRECTORY}
        hasGeminiKey={settings.hasGeminiKey}
      />
    </TeamLogoResolutionProvider>
  );
}
