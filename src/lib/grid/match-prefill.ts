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

  const { assignments, owner, ...rest } = match;
  void assignments;

  return {
    ...rest,
    ownerId: owner?.id ?? null,
    assignedPersonByRole,
  };
}
