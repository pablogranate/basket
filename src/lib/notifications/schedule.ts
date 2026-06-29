import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

const ARG_TZ = "America/Argentina/Buenos_Aires";

// When the assigned team is notified for a match, per its kickoff clock time
// (ARG, noon-inclusive): kickoff >= 12:00 -> that day at 11:00; kickoff < 12:00
// -> the previous day at 22:00. ARG observes no DST, so fixed-offset is exact.
export function computeSendAt(kickoffIso: string): Date {
  const kickoff = new Date(kickoffIso);
  const localDate = formatInTimeZone(kickoff, ARG_TZ, "yyyy-MM-dd");
  const localHour = Number(formatInTimeZone(kickoff, ARG_TZ, "H"));

  if (localHour >= 12) {
    return fromZonedTime(`${localDate}T11:00:00`, ARG_TZ);
  }

  // Previous calendar day at 22:00 ARG.
  const dayBefore = formatInTimeZone(
    new Date(fromZonedTime(`${localDate}T00:00:00`, ARG_TZ).getTime() - 86400000),
    ARG_TZ,
    "yyyy-MM-dd",
  );
  return fromZonedTime(`${dayBefore}T22:00:00`, ARG_TZ);
}
