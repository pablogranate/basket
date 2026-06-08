export const appEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  appTimezone: process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "America/Bogota",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  allowGuestMiJornadaAccess: process.env.ALLOW_GUEST_MI_JORNADA === "true",
  portalGeminiApiKey: process.env.PORTAL_GEMINI_API_KEY ?? "",
  portalGeminiModel: process.env.PORTAL_GEMINI_MODEL ?? "gemini-2.5-flash",
  authDatabaseUrl: process.env.AUTH_DATABASE_URL ?? "",
  intakeApiKey: process.env.INTAKE_API_KEY ?? "",
  gridSyncEnabled: process.env.GRID_SYNC_ENABLED !== "false",
  gridSyncCron: process.env.GRID_SYNC_CRON ?? "0 */6 * * *",
};

export const isSupabaseConfigured = Boolean(
  appEnv.supabaseUrl && appEnv.supabaseAnonKey,
);

export function assertSupabaseEnv() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
}

export function assertServiceRoleKey() {
  if (!appEnv.supabaseServiceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. The CSV importer requires a service role key.",
    );
  }
}

export function assertAuthDatabaseUrl() {
  if (!appEnv.authDatabaseUrl) {
    throw new Error(
      "Missing AUTH_DATABASE_URL. The Better Auth identity database requires a connection string.",
    );
  }
}
