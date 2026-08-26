// The four referrers that count as real history for a `people` row. Its
// person_functions tags do not: those came from the CSV imports and are deleted
// along with the person (see migration 0034).
export type PersonHistoryCounts = {
  assignments: number;
  ownedMatches: number;
  notificationLogs: number;
  teams: number;
  personFunctions?: number;
};

export function isPersonPurgeable({
  email,
  counts,
}: {
  email: string | null | undefined;
  counts: PersonHistoryCounts;
}) {
  if (email?.trim()) {
    return false;
  }

  return (
    counts.assignments === 0 &&
    counts.ownedMatches === 0 &&
    counts.notificationLogs === 0 &&
    counts.teams === 0
  );
}
