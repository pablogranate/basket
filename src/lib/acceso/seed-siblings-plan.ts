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

export type SkippedSiblingUser = {
  email: string;
  app: SiblingApp;
  reason: string;
};

// Legacy users the mapping drops — surfaced so the dry run says who and why.
export function findSkippedSiblingUsers(
  input: SiblingSeedInput,
): SkippedSiblingUser[] {
  const skipped: SkippedSiblingUser[] = [];

  for (const user of input.incidencias) {
    if (!INCIDENCIAS_ROLE_LEVEL[user.role]) {
      skipped.push({
        email: normalizeEmail(user.email),
        app: "incidencias",
        reason: user.role ? `rol desconocido: ${user.role}` : "sin perfil",
      });
    }
  }

  for (const user of input.analytics) {
    if (!ANALYTICS_ROLE_LEVEL[user.role]) {
      skipped.push({
        email: normalizeEmail(user.email),
        app: "analytics",
        reason: `rol desconocido: ${user.role}`,
      });
    }
  }

  return skipped.filter((row) => row.email);
}

export function planSiblingAccesos(input: SiblingSeedInput): PlannedAcceso[] {
  const viewers = new Set(input.opsViewerEmails.map(normalizeEmail));
  const byKey = new Map<string, PlannedAcceso>();

  const add = (row: {
    email: string;
    app: SiblingApp;
    level: AccesoLevel | undefined;
  }) => {
    const email = normalizeEmail(row.email);
    if (!email || !row.level) {
      return;
    }
    // Later rows win, so a re-listed email keeps the last Nivel seen.
    const key = `${email}/${row.app}`;
    byKey.delete(key);
    byKey.set(key, { email, app: row.app, level: row.level });
  };

  for (const user of input.incidencias) {
    add({
      email: user.email,
      app: "incidencias",
      level: INCIDENCIAS_ROLE_LEVEL[user.role],
    });
  }

  for (const user of input.ops) {
    add({
      email: user.email,
      app: "ops",
      level: viewers.has(normalizeEmail(user.email)) ? "read" : "write",
    });
  }

  for (const user of input.analytics) {
    add({
      email: user.email,
      app: "analytics",
      level: ANALYTICS_ROLE_LEVEL[user.role],
    });
  }

  return [...byKey.values()];
}
