import { config } from "dotenv";

config({ path: ".env.local" });

import type { UserContext } from "@/lib/auth";
import type { ProfileRow } from "@/lib/database.types";

export const RUN_NOW = Date.now();

// The only non-determinism in the loaders is synthetic placeholder rows stamped
// with `new Date().toISOString()` (getMatchDetailData fills empty role slots).
// Real domain timestamps are dated months ago, so any timestamp within ~5 min
// of the run is a synthetic "now" and gets masked before diffing.
const RECENT_WINDOW_MS = 5 * 60_000;
const ISO_TS = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/;

export function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") {
    if (ISO_TS.test(value)) {
      const t = Date.parse(value);
      if (Number.isFinite(t) && Math.abs(t - RUN_NOW) < RECENT_WINDOW_MS) {
        return "<RECENT_TS>";
      }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = normalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function stable(value: unknown): string {
  return JSON.stringify(normalize(value), null, 2);
}

export function makeCtx(params: {
  role: UserContext["role"];
  email: string | null;
  profileName?: string | null;
  userId?: string | null;
}): UserContext {
  const profile: ProfileRow | null = params.email
    ? ({
        id: params.userId ?? "00000000-0000-0000-0000-000000000000",
        full_name: params.profileName ?? null,
        email: params.email,
        role: params.role,
        auth_user_id: null,
        created_at: "2026-01-01T00:00:00+00:00",
        updated_at: "2026-01-01T00:00:00+00:00",
      } as ProfileRow)
    : null;
  return {
    userId: params.userId ?? "00000000-0000-0000-0000-000000000000",
    profileId: profile?.id ?? null,
    email: params.email,
    profile,
    role: params.role,
    canEdit: params.role === "admin" || params.role === "editor",
    hasAccess: true,
  } as UserContext;
}

export type Samples = {
  matchId: string;
  personId: string;
  personEmail: string | null;
  personName: string;
  teamSlug: string;
  competition: string;
  gridDate: string;
};

// Resolve real IDs at runtime via an independent postgres connection so the
// harness never depends on the code under test to pick its inputs.
export async function resolveSamples(): Promise<Samples> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const [match] = await sql`
      select m.id, to_char(m.kickoff_at, 'YYYY-MM-DD') as day, m.competition
      from matches m join assignments a on a.match_id = m.id
      group by m.id order by count(*) desc, m.id limit 1`;
    const [person] = await sql`
      select p.id, p.email, p.full_name
      from people p join assignments a on a.person_id = p.id
      where p.active group by p.id order by count(*) desc, p.id limit 1`;
    const [team] = await sql`select slug from teams order by slug limit 1`;
    const [comp] = await sql`
      select competition from matches where competition is not null
      group by competition order by count(*) desc limit 1`;
    return {
      matchId: match.id,
      personId: person.id,
      personEmail: person.email,
      personName: person.full_name,
      teamSlug: team.slug,
      competition: comp.competition,
      gridDate: match.day,
    };
  } finally {
    await sql.end();
  }
}
