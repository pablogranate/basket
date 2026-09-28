// Sibling apps and Niveles — the pure half of the Acceso model (CONTEXT.md
// "Unified auth"). Dependency-free so parsers and client components import it;
// the schema enums in src/lib/auth/schema.ts are the source these mirror, and
// the type checks below fail the build if they drift.
import type { appAccessApp, appAccessLevel } from "@/lib/auth/schema";

export const SIBLING_APPS = [
  "analytics",
  "incidencias",
  "generator",
  "ops",
  "facturacion",
] as const satisfies ReadonlyArray<(typeof appAccessApp.enumValues)[number]>;

export const ACCESO_LEVELS = [
  "read",
  "write",
  "admin",
] as const satisfies ReadonlyArray<(typeof appAccessLevel.enumValues)[number]>;

// Users-matrix select value meaning "revoke"; never a catalog role key.
export const NO_ROLE_OPTION = "none";

export type SiblingApp = (typeof SIBLING_APPS)[number];
export type AccesoLevel = (typeof ACCESO_LEVELS)[number];

export function isSiblingApp(value: string): value is SiblingApp {
  return (SIBLING_APPS as ReadonlyArray<string>).includes(value);
}

export function isAccesoLevel(value: string): value is AccesoLevel {
  return (ACCESO_LEVELS as ReadonlyArray<string>).includes(value);
}

export const SIBLING_APP_LABELS: Record<SiblingApp, string> = {
  analytics: "Analytics",
  incidencias: "Incidencias",
  generator: "Generador",
  ops: "Operaciones",
  facturacion: "Facturación",
};

const DEFAULT_LEVEL_LABELS: Record<AccesoLevel, string> = {
  read: "Lectura",
  write: "Escritura",
  admin: "Admin",
};

// Per-app wording of the Niveles; the stored values stay read/write/admin.
// An app may leave a Nivel out when it grants nothing there.
const APP_LEVEL_LABELS: Partial<
  Record<SiblingApp, Partial<Record<AccesoLevel, string>>>
> = {
  facturacion: { write: "Coordinador", admin: "Admin" },
};

export type AccesoLevelOption = { level: AccesoLevel; label: string };

export function accesoLevelOptions(app: SiblingApp): AccesoLevelOption[] {
  const labels = APP_LEVEL_LABELS[app] ?? DEFAULT_LEVEL_LABELS;
  return ACCESO_LEVELS.flatMap((level) => {
    const label = labels[level];
    return label ? [{ level, label }] : [];
  });
}

export function isLevelOffered(app: SiblingApp, level: AccesoLevel): boolean {
  return accesoLevelOptions(app).some((option) => option.level === level);
}

// What the apex launcher lists for one person: the portal when their Cuenta
// admits them, then each sibling whose Acceso holds a Nivel that app uses
// (facturacion ignores read). Nobody gets an empty launcher: the portal stays
// as the door to a Solicitud de acceso.
export type LauncherApp = "portal" | SiblingApp;

// A super admin is admin in every app (ADR 0010), so they get all of them.
export function launcherApps({
  hasPortalAccess,
  superAdmin = false,
  accesos,
}: {
  hasPortalAccess: boolean;
  superAdmin?: boolean;
  accesos: ReadonlyArray<{ app: SiblingApp; level: AccesoLevel }>;
}): LauncherApp[] {
  if (superAdmin) {
    return ["portal", ...SIBLING_APPS];
  }

  const siblings = SIBLING_APPS.filter((app) =>
    accesos.some(
      (acceso) => acceso.app === app && isLevelOffered(app, acceso.level),
    ),
  );

  if (hasPortalAccess || siblings.length === 0) {
    return ["portal", ...siblings];
  }

  return siblings;
}
