import { customType } from "drizzle-orm/pg-core";

// Postgres emits timestamptz text as "YYYY-MM-DD HH:MM:SS[.ffffff][+HH[:MM]]".
// The whole app (and the retired supabase-js/PostgREST layer) treats these
// columns as ISO 8601 strings: "YYYY-MM-DDTHH:MM:SS[.ffffff]+HH:MM". Normalize
// on read so ported loaders return byte-identical strings and downstream date
// handling (date-fns, toDateKey, serialization) is unchanged.
export function pgTimestamptzToIso(raw: string): string {
  let s = raw.replace(" ", "T");
  const m = s.match(/([+-]\d{2})(\d{2})?$/);
  if (m && !m[2]) {
    s = `${s}:00`; // "+00" -> "+00:00"
  } else if (m && m[2]) {
    s = `${s.slice(0, -2)}:${m[2]}`; // "+0530" -> "+05:30"
  }
  return s;
}

// A timestamptz column whose driver value is normalized to the ISO 8601 form
// PostgREST used. Drizzle's built-in `timestamp` forces raw Postgres text and
// ignores connection-level type parsers, so normalization has to live in the
// column codec. Writes pass ISO strings straight through (Postgres accepts them).
export const timestamptz = customType<{ data: string; driverData: string }>({
  dataType() {
    return "timestamp with time zone";
  },
  fromDriver(value) {
    return pgTimestamptzToIso(value);
  },
});
