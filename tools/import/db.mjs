import postgres from "postgres";

// Shared connection for the import CLIs. These run service-role equivalent: a
// direct DATABASE_URL connection to the self-hosted domain Postgres (no
// Supabase). Callers must `await sql.end()` before returning so Node can exit.
export function connectDb() {
  if (!process.env.DATABASE_URL) {
    console.error("Falta DATABASE_URL en el entorno.");
    process.exit(1);
  }

  return postgres(process.env.DATABASE_URL, { max: 5 });
}
