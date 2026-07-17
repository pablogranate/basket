import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

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
  } finally {
    await sql.end();
  }
}
