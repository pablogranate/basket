import { formatInTimeZone } from "date-fns-tz";

import { FIXTURE_TIMEZONE } from "@/lib/fixtures/link-plan";

export const SYNC_DAYS_BEFORE = 7;
export const SYNC_DAYS_AFTER = 45;

export function fixtureToday(now: Date) {
  return formatInTimeZone(now, FIXTURE_TIMEZONE, "yyyy-MM-dd");
}

export function addIsoDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function defaultFixturesSyncWindow(now: Date) {
  const today = fixtureToday(now);
  return { from: addIsoDays(today, -SYNC_DAYS_BEFORE), to: addIsoDays(today, SYNC_DAYS_AFTER) };
}
