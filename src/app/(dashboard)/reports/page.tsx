import { ReportsWorkspace } from "@/components/reports/reports-workspace";
import { TeamLogoResolutionProvider } from "@/components/team-logo-resolution-context";
import { INCIDENT_DIRECTORY } from "@/lib/incidents";
import { REPORT_ACTIVITY_LOG, REPORT_DIRECTORY } from "@/lib/reports";
import { getSettingsSnapshot } from "@/lib/settings";
import { matchLabelLogoPairs } from "@/lib/match-label";
import { resolveTeamLogoMap } from "@/lib/team-logos";

export default async function ReportsPage() {
  const settings = await getSettingsSnapshot();
  // Pre-resolve crests for every match rendered in the reports + embedded
  // incidents tables so the rows paint logos on first paint (no per-row fetch).
  const teamLogoMap = resolveTeamLogoMap([
    ...REPORT_DIRECTORY.flatMap((report) =>
      matchLabelLogoPairs(report.match_label, report.competition),
    ),
    ...INCIDENT_DIRECTORY.flatMap((incident) =>
      matchLabelLogoPairs(incident.matchLabel, incident.competition),
    ),
  ]);

  return (
    <TeamLogoResolutionProvider value={teamLogoMap}>
      <ReportsWorkspace
        reports={REPORT_DIRECTORY}
        activities={REPORT_ACTIVITY_LOG}
        incidents={INCIDENT_DIRECTORY}
        hasGeminiKey={settings.hasGeminiKey}
      />
    </TeamLogoResolutionProvider>
  );
}
