const BETTER_AUTH_URL =
  process.env.BETTER_AUTH_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

export const appEnv = {
  appTimezone: process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "America/Bogota",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  allowGuestMiJornadaAccess: process.env.ALLOW_GUEST_MI_JORNADA === "true",
  portalGeminiApiKey: process.env.PORTAL_GEMINI_API_KEY ?? "",
  portalGeminiModel: process.env.PORTAL_GEMINI_MODEL ?? "gemini-2.5-flash",
  databaseUrl: process.env.DATABASE_URL ?? "",
  authDatabaseUrl: process.env.AUTH_DATABASE_URL ?? "",
  betterAuthSecret: process.env.BETTER_AUTH_SECRET ?? "",
  betterAuthUrl: BETTER_AUTH_URL,
  // Every auth flow (login, magic link, OAuth callback) lives on the portal
  // origin, which is exactly what BETTER_AUTH_URL must point at. Derive
  // user-facing portal links from it instead of NEXT_PUBLIC_APP_URL, which may
  // point at the apex launcher and would bounce recipients through an extra
  // cross-subdomain login redirect.
  portalBaseUrl: BETTER_AUTH_URL.replace(/\/$/, ""),
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
  gridSyncCron: process.env.GRID_SYNC_CRON ?? "*/30 * * * *",
  openwaApiUrl: process.env.OPENWA_API_URL ?? "",
  openwaApiKey: process.env.OPENWA_API_KEY ?? "",
  openwaNotifyEnabled: process.env.OPENWA_NOTIFY_ENABLED !== "false",
  notificationsEnabled: process.env.NOTIFICATIONS_ENABLED !== "false",
};

export function assertDatabaseUrl() {
  if (!appEnv.databaseUrl) {
    throw new Error(
      "Missing DATABASE_URL. The portal domain database requires a connection string.",
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

  // Auth runs on the portal origin only. Pointing BETTER_AUTH_URL at the apex
  // launcher makes every emailed login link bounce through a cross-subdomain
  // redirect before reaching the login form.
  try {
    if (new URL(appEnv.betterAuthUrl).hostname === "basket-app.com") {
      console.warn(
        "[auth] BETTER_AUTH_URL points at the apex host; it should be the portal origin (https://portal.basket-app.com).",
      );
    }
  } catch {
    console.warn(`[auth] BETTER_AUTH_URL is not a valid URL: ${appEnv.betterAuthUrl}`);
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
