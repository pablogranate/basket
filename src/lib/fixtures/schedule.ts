import { formatInTimeZone } from "date-fns-tz";

// CABB publishes Argentine local dates and times; the grid stores UTC instants.
export const FIXTURE_TIMEZONE = "America/Argentina/Buenos_Aires";

export type FixtureSchedule = {
  date: string;
  time: string;
};

export function argentineSchedule(kickoffAt: string): FixtureSchedule {
  return {
    date: formatInTimeZone(kickoffAt, FIXTURE_TIMEZONE, "yyyy-MM-dd"),
    time: formatInTimeZone(kickoffAt, FIXTURE_TIMEZONE, "HH:mm"),
  };
}

// The grid Partido's kickoff, in Argentine time, against the CABB schedule. A
// date or time CABB has not published yet is not a mismatch.
export function compareFixtureSchedule(
  fixture: { matchDate: string | null; matchTime: string | null },
  kickoffAt: string,
) {
  const grid = argentineSchedule(kickoffAt);
  const differs =
    (fixture.matchDate !== null && fixture.matchDate !== grid.date) ||
    (fixture.matchTime !== null && fixture.matchTime !== grid.time);

  return { grid, differs };
}
