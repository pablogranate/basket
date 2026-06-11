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
  betterAuthSecret: process.env.BETTER_AUTH_SECRET ?? "",
  betterAuthUrl:
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  staffEmailDomain: process.env.STAFF_EMAIL_DOMAIN ?? "basquetpass.tv",
  smtpHost: process.env.SMTP_HOST ?? "smtp.gmail.com",
  smtpPort: process.env.SMTP_PORT ?? "587",
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  mailFrom: process.env.MAIL_FROM ?? process.env.SMTP_USER ?? "",
  intakeApiKey: process.env.INTAKE_API_KEY ?? "",
  gridSyncEnabled: process.env.GRID_SYNC_ENABLED !== "false",
  gridSyncCron: process.env.GRID_SYNC_CRON ?? "0 */6 * * *",
  openwaApiUrl: process.env.OPENWA_API_URL ?? "",
  openwaApiKey: process.env.OPENWA_API_KEY ?? "",
  openwaNotifyEnabled: process.env.OPENWA_NOTIFY_ENABLED !== "false",
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

export function assertBetterAuthEnv() {
  if (!appEnv.betterAuthSecret) {
    throw new Error(
      "Missing BETTER_AUTH_SECRET. Generate one with `openssl rand -base64 32`.",
    );
  }

  if (!appEnv.googleClientId || !appEnv.googleClientSecret) {
    throw new Error(
      "Missing Google OAuth credentials. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    );
  }
}

export function assertSmtpEnv() {
  if (!appEnv.smtpHost || !appEnv.smtpUser || !appEnv.smtpPass) {
    throw new Error(
      "Missing SMTP environment variables. Set SMTP_HOST, SMTP_USER and SMTP_PASS.",
    );
  }
}

export const isOpenwaConfigured = Boolean(
  appEnv.openwaApiUrl && appEnv.openwaApiKey,
);

export function assertOpenwaEnv() {
  if (!isOpenwaConfigured) {
    throw new Error(
      "Missing OpenWA environment variables. Set OPENWA_API_URL and OPENWA_API_KEY.",
    );
  }
}
