import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import { FIXTURE_TIMEZONE } from "@/lib/fixtures/schedule";
import type { FixtureRecord } from "@/lib/fixtures/parse";

const FLIGHT_CHUNK = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;

// Next.js App Router pages carry their data in flight chunks; joined, they hold
// the JSON the page rendered from.
export function readFlightPayload(html: string) {
  let payload = "";
  for (const [, chunk = ""] of html.matchAll(FLIGHT_CHUNK)) {
    payload += JSON.parse(`"${chunk}"`) as string;
  }
  return payload;
}

// Parses the JSON array or object that follows `key` (which must end with its
// opening bracket), taking the last occurrence before `before`.
export function readJsonAfter(payload: string, key: string, before = payload.length): unknown {
  const index = payload.lastIndexOf(key, before);
  if (index < 0) {
    return null;
  }

  const start = index + key.length - 1;
  let depth = 0;
  let inString = false;
  for (let i = start; i < payload.length; i += 1) {
    const char = payload[i];
    if (inString) {
      if (char === "\\") i += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === "[" || char === "{") {
      depth += 1;
    } else if (char === "]" || char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(payload.slice(start, i + 1)) as unknown;
      }
    }
  }
  return null;
}

export function decodeHtml(value: string) {
  return value
    .replaceAll(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replaceAll(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replaceAll("&quot;", '"')
    .replaceAll("&nbsp;", " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

export function htmlText(value: string | undefined) {
  const text = decodeHtml((value ?? "").replaceAll(/<[^>]*>/g, " ")).replaceAll(/\s+/g, " ").trim();
  return text || null;
}

// Fixtures store the Argentine date and time of an instant.
export function fixtureScheduleAt(instant: Date | string) {
  return {
    matchDate: formatInTimeZone(instant, FIXTURE_TIMEZONE, "yyyy-MM-dd"),
    matchTime: formatInTimeZone(instant, FIXTURE_TIMEZONE, "HH:mm"),
  };
}

// A wall-clock date and time in `timeZone`, as an Argentine schedule. Without
// a time only the date is known, and it stays the organiser's date.
export function zonedSchedule({ date, time, timeZone }: { date: string; time: string | null; timeZone: string }) {
  if (!time) {
    return { matchDate: date, matchTime: null };
  }
  return fixtureScheduleAt(fromZonedTime(`${date}T${time}:00`, timeZone));
}

export function emptyFixture(id: string, competition: string): FixtureRecord {
  return {
    id,
    competition,
    category: null,
    phase: null,
    group: null,
    homeClub: null,
    homeTeam: null,
    awayClub: null,
    awayTeam: null,
    suspended: false,
    homePoints: null,
    awayPoints: null,
    matchDate: null,
    matchTime: null,
    venue: null,
    court: null,
    city: null,
    province: null,
  };
}
