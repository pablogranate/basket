import {
  addMinutes,
  format,
  formatISO,
  parseISO,
} from "date-fns";
import { es } from "date-fns/locale";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import { DEFAULT_MATCH_DURATION_MINUTES, DEFAULT_TIMEZONE } from "@/lib/constants";

export function buildKickoffAt(params: {
  date: string;
  time: string;
  timezone?: string;
}) {
  const timezone = params.timezone || DEFAULT_TIMEZONE;
  const localDate = `${params.date}T${params.time}:00`;

  return fromZonedTime(localDate, timezone).toISOString();
}

export function formatMatchTime(
  kickoffAt: string,
  timezone = DEFAULT_TIMEZONE,
  pattern = "HH:mm",
) {
  return formatInTimeZone(kickoffAt, timezone, pattern, { locale: es });
}

export const PENDING_KICKOFF_TIME_LABEL = "Pend. Confirmación";

export function isPendingKickoffTime(
  kickoffAt: string,
  timezone = DEFAULT_TIMEZONE,
) {
  return formatInTimeZone(kickoffAt, timezone, "HH:mm") === "00:00";
}

export function formatMatchTimeLabel(
  kickoffAt: string,
  timezone = DEFAULT_TIMEZONE,
) {
  return isPendingKickoffTime(kickoffAt, timezone)
    ? PENDING_KICKOFF_TIME_LABEL
    : formatMatchTime(kickoffAt, timezone);
}

export function formatMatchDate(
  kickoffAt: string,
  timezone = DEFAULT_TIMEZONE,
  pattern = "EEE d MMM",
) {
  return formatInTimeZone(kickoffAt, timezone, pattern, { locale: es });
}

export function formatMatchDateTime(
  kickoffAt: string,
  timezone = DEFAULT_TIMEZONE,
) {
  return formatInTimeZone(kickoffAt, timezone, "EEE d MMM · HH:mm", {
    locale: es,
  });
}

export function getMatchEndIso(
  kickoffAt: string,
  durationMinutes = DEFAULT_MATCH_DURATION_MINUTES,
) {
  return addMinutes(parseISO(kickoffAt), durationMinutes).toISOString();
}

export function getMonthRange(dateInput: string, timezone = DEFAULT_TIMEZONE) {
  const [yearPart, monthPart] = dateInput.slice(0, 7).split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const lastDay = new Date(year, month, 0).getDate();

  return {
    startUtc: fromZonedTime(`${yearPart}-${monthPart}-01T00:00:00.000`, timezone).toISOString(),
    endUtc: fromZonedTime(
      `${yearPart}-${monthPart}-${String(lastDay).padStart(2, "0")}T23:59:59.999`,
      timezone,
    ).toISOString(),
  };
}

export function getDayRange(dateInput: string, timezone = DEFAULT_TIMEZONE) {
  return {
    startUtc: fromZonedTime(`${dateInput}T00:00:00.000`, timezone).toISOString(),
    endUtc: fromZonedTime(`${dateInput}T23:59:59.999`, timezone).toISOString(),
  };
}

export function getDateInputValue(date = new Date()) {
  return format(date, "yyyy-MM-dd");
}

export function getMonthInputValue(date = new Date()) {
  return format(date, "yyyy-MM");
}

export function resolveDateWindow(params: {
  view: "day" | "month";
  date: string;
  timezone?: string;
}) {
  const timezone = params.timezone || DEFAULT_TIMEZONE;
  if (params.view === "month") {
    return getMonthRange(`${params.date}-01`, timezone);
  }

  return getDayRange(params.date, timezone);
}

export function toCalendarDates(params: {
  kickoffAt: string;
  durationMinutes?: number;
}) {
  const kickoff = parseISO(params.kickoffAt);
  const end = addMinutes(
    kickoff,
    params.durationMinutes ?? DEFAULT_MATCH_DURATION_MINUTES,
  );

  return `${format(kickoff, "yyyyMMdd'T'HHmmss'Z'")}/${format(
    end,
    "yyyyMMdd'T'HHmmss'Z'",
  )}`;
}

export function toDateKey(kickoffAt: string, timezone = DEFAULT_TIMEZONE) {
  return formatInTimeZone(kickoffAt, timezone, "yyyy-MM-dd");
}

export function isInDisplayedMonth(
  kickoffAt: string,
  targetMonth: string,
  timezone = DEFAULT_TIMEZONE,
) {
  return formatInTimeZone(kickoffAt, timezone, "yyyy-MM") === targetMonth;
}

export function toLocalIsoString(date: Date) {
  return formatISO(date);
}
