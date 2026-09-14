// Pure mapping from the legacy per-app user lists to Acceso rows (spec #172
// story 27). No I/O: the script feeds it what it fetched, tests feed literals.
import type { AccesoLevel, SiblingApp } from "@/lib/acceso/catalog";

export type SiblingSeedInput = {
  // Supabase Auth users of incidencias joined to their profiles.role.
  incidencias: { email: string; role: string }[];
  // Supabase Auth users of the ops hub; viewer-only emails come from its
  // hardcoded list (ops repo, src/lib/roles.ts).
  ops: { email: string }[];
  opsViewerEmails: string[];
  // Analytics `auth_allowed_emails` rows.
  analytics: { email: string; role: string }[];
};

export type PlannedAcceso = {
  email: string;
  app: SiblingApp;
  level: AccesoLevel;
};

const INCIDENCIAS_ROLE_LEVEL: Record<string, AccesoLevel> = {
  operador: "write",
  admin: "admin",
};

const ANALYTICS_ROLE_LEVEL: Record<string, AccesoLevel> = {
  viewer: "read",
  admin: "admin",
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function planSiblingAccesos(input: SiblingSeedInput): PlannedAcceso[] {
  const viewers = new Set(input.opsViewerEmails.map(normalizeEmail));
  const byKey = new Map<string, PlannedAcceso>();

  const add = (email: string, app: SiblingApp, level: AccesoLevel | undefined) => {
    const normalized = normalizeEmail(email);
    if (!normalized || !level) {
      return;
    }
    // Later rows win, so a re-listed email keeps the last Nivel seen.
    byKey.delete(`${normalized}/${app}`);
    byKey.set(`${normalized}/${app}`, { email: normalized, app, level });
  };

  for (const user of input.incidencias) {
    add(user.email, "incidencias", INCIDENCIAS_ROLE_LEVEL[user.role]);
  }

  for (const user of input.ops) {
    const level: AccesoLevel = viewers.has(normalizeEmail(user.email))
      ? "read"
      : "write";
    add(user.email, "ops", level);
  }

  for (const user of input.analytics) {
    add(user.email, "analytics", ANALYTICS_ROLE_LEVEL[user.role]);
  }

  return [...byKey.values()];
}
