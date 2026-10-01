import postgres from "postgres";

import type { UserContext } from "@/lib/auth";
import type { AppRole } from "@/lib/database.types";
import { can } from "@/lib/roles";

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
  "notification_logs",
  "people_teams",
  "assignments",
  "matches",
  "app_settings",
  "announcements",
  "person_functions",
  "people",
  "roles",
  "profiles",
  // Auth DB tables (same throwaway database): cascades to sessions, Accesos
  // and Solicitudes.
  "auth_app_request_recipients",
  "auth_user",
];

export async function truncateAll(sql: Sql) {
  const list = RESET_TABLES.map((t) => `"${t}"`).join(", ");
  await sql.unsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

// Seed an identity in the Auth DB tables (same throwaway database). Returns
// the Better Auth text id.
export async function seedAuthUser(
  sql: Sql,
  values: { email: string; name?: string },
): Promise<string> {
  const id = `user-${crypto.randomUUID()}`;
  const now = new Date();
  await sql`
    INSERT INTO auth_user ${sql({
      id,
      email: values.email,
      name: values.name ?? values.email.split("@")[0],
      email_verified: true,
      created_at: now,
      updated_at: now,
    })}`;
  return id;
}

// Seed a profile row (the audited actor) and return a minimal UserContext. Write
// helpers only read ctx.profileId, so the rest is filled to satisfy the type.
// One identity's stored Acceso row in one app, grantor included (the view
// that gates read leaves the grantor out).
export async function accessRow(
  sql: Sql,
  userId: string,
  app: string,
): Promise<{ role: string; grantedBy: string | null } | null> {
  const [row] = await sql<{ role: string; grantedBy: string | null }[]>`
    SELECT role, granted_by AS "grantedBy" FROM auth_app_access
    WHERE user_id = ${userId} AND app = ${app}`;
  return row ?? null;
}

export async function seedActor(
  sql: Sql,
  overrides: { role?: string; email?: string } = {},
): Promise<{ profileId: string; ctx: UserContext }> {
  const id = crypto.randomUUID();
  const email = overrides.email ?? `actor-${id}@basquetpass.tv`;
  const role = overrides.role ?? "admin";

  await sql`INSERT INTO profiles ${sql({ id, email, full_name: "Test Actor" })}`;

  const ctx = {
    userId: id,
    profileId: id,
    email,
    profile: null,
    role,
    canEdit: can({ role: role as AppRole, hasAccess: true }, "edit"),
    hasAccess: true,
  } as unknown as UserContext;

  return { profileId: id, ctx };
}
