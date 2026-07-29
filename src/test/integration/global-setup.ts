import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// The frozen drizzle baseline snapshots the schema as of migration 0026;
// everything after it lives only in supabase/migrations. Without replaying those,
// the test DB is missing real columns (people.deleted_at, clubs.manager, …) and
// integration tests fail against a schema production has not run in months.
//
// Raise this when a future baseline is regenerated.
const BASELINE_INCLUDES_THROUGH = 26;
const SUPABASE_MIGRATIONS_DIR = "supabase/migrations";

async function applyPostBaselineMigrations(sql: postgres.Sql) {
  const files = (await readdir(SUPABASE_MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .filter((name) => {
      const serial = Number.parseInt(name.slice(0, 4), 10);
      return Number.isFinite(serial) && serial > BASELINE_INCLUDES_THROUGH;
    })
    .sort();

  for (const file of files) {
    const statement = await readFile(join(SUPABASE_MIGRATIONS_DIR, file), "utf8");
    await sql.unsafe(statement);
  }
}

// Applies the portal baseline migration to the throwaway DATABASE_URL once,
// before any integration test runs. Fails loudly if pointed at anything but a
// dedicated test DB (safety: never run these against prod/Supabase).
export default async function setup() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "Integration tests need DATABASE_URL pointing at a throwaway Postgres. " +
        "Run `npm run test:integration` (spins an ephemeral container).",
    );
  }

  if (!/basket[-_]portal[-_]test/.test(url)) {
    throw new Error(
      `Refusing to run integration tests against DATABASE_URL="${url}". ` +
        "The database name must contain 'basket-portal-test' (guards against prod).",
    );
  }

  const sql = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "drizzle/portal" });
    await applyPostBaselineMigrations(sql);
  } finally {
    await sql.end();
  }
}
