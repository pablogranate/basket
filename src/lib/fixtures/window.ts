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

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function fixtureMonth(now: Date) {
  return formatInTimeZone(now, FIXTURE_TIMEZONE, "yyyy-MM");
}

export function parseFixtureMonth(value: string | string[] | undefined, now: Date) {
  return typeof value === "string" && MONTH_PATTERN.test(value) ? value : fixtureMonth(now);
}

export function addFixtureMonths(month: string, months: number) {
  const date = new Date(`${month}-15T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 7);
}

export function fixtureMonthRange(month: string) {
  const lastDay = new Date(`${addFixtureMonths(month, 1)}-01T12:00:00Z`);
  lastDay.setUTCDate(0);
  return { from: `${month}-01`, to: lastDay.toISOString().slice(0, 10) };
}
