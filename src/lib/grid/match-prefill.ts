import type { MatchEditPrefill, MatchListItem } from "@/lib/types";

// Collapse a MatchListItem into the slim shape the edit modal needs. Keeps the
// scalar match row, drops the assignment/owner object graph, and exposes only a
// role-name -> assigned person-id map so the modal can prefill its selects.
export function toMatchEditPrefill(match: MatchListItem): MatchEditPrefill {
  const assignedPersonByRole: Record<string, string> = {};

  for (const assignment of match.assignments) {
    if (assignment.person?.id) {
      assignedPersonByRole[assignment.role.name] = assignment.person.id;
    }
  }

  return {
    id: match.id,
    production_code: match.production_code,
    competition: match.competition,
    home_team: match.home_team,
    away_team: match.away_team,
    kickoff_at: match.kickoff_at,
    timezone: match.timezone,
    status: match.status,
    production_mode: match.production_mode,
    venue: match.venue,
    duration_minutes: match.duration_minutes,
    commentary_plan: match.commentary_plan,
    transport: match.transport,
    notes: match.notes,
    ownerId: match.owner?.id ?? null,
    assignedPersonByRole,
  };
}
