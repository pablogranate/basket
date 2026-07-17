import postgres from "postgres";

import type { UserContext } from "@/lib/auth";

// Independent raw connection for seeding + assertions, so tests never depend on
// the code under test to set up or read their own fixtures (mirrors the parity
// harness's resolveSamples approach).
export function testSql() {
  return postgres(process.env.DATABASE_URL!, { max: 1 });
}

type Sql = ReturnType<typeof testSql>;

// Truncated before every test for a deterministic slate. Order-independent
// thanks to CASCADE; RESTART IDENTITY resets audit_log's bigint sequence.
const RESET_TABLES = [
  "audit_log",
  "assignments",
  "matches",
  "app_settings",
  "announcements",
  "person_functions",
  "people",
  "roles",
  "profiles",
];

export async function truncateAll(sql: Sql) {
  const list = RESET_TABLES.map((t) => `"${t}"`).join(", ");
  await sql.unsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

// Seed a profile row (the audited actor) and return a minimal UserContext. Write
// helpers only read ctx.profileId, so the rest is filled to satisfy the type.
export async function seedActor(
  sql: Sql,
  overrides: { role?: string; email?: string } = {},
): Promise<{ profileId: string; ctx: UserContext }> {
  const id = crypto.randomUUID();
  const email = overrides.email ?? `actor-${id}@basquetpass.tv`;
  const role = overrides.role ?? "admin";

  await sql`INSERT INTO profiles ${sql({ id, email, role, full_name: "Test Actor" })}`;

  const ctx = {
    userId: id,
    profileId: id,
    email,
    profile: null,
    role,
    canEdit: role === "admin" || role === "editor",
    hasAccess: true,
  } as unknown as UserContext;

  return { profileId: id, ctx };
}
