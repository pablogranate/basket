// Sibling apps: the pure half of the Acceso model (CONTEXT.md "Unified auth").
// Dependency-free so parsers and client components import it. Their keys are
// rows of auth_app (ADR 0010); roles live in auth_app_role.
export const SIBLING_APPS = [
  "analytics",
  "incidencias",
  "generator",
  "ops",
  "facturacion",
] as const;

// Users-matrix select value meaning "revoke"; never a catalog role key.
export const NO_ROLE_OPTION = "none";

export type SiblingApp = (typeof SIBLING_APPS)[number];

export function isSiblingApp(value: string): value is SiblingApp {
  return (SIBLING_APPS as ReadonlyArray<string>).includes(value);
}

export const SIBLING_APP_LABELS: Record<SiblingApp, string> = {
  analytics: "Analytics",
  incidencias: "Incidencias",
  generator: "Generador",
  ops: "Operaciones",
  facturacion: "Facturación",
};

// What the apex launcher lists for one person: the portal when their Cuenta
// admits them, then each sibling they hold a role in. `apps` comes from
// auth_effective_access, so a super admin already has every app. Nobody gets
// an empty launcher: the portal stays as the door to a Solicitud de acceso.
export type LauncherApp = "portal" | SiblingApp;

export function launcherApps({
  hasPortalAccess,
  superAdmin = false,
  apps,
}: {
  hasPortalAccess: boolean;
  superAdmin?: boolean;
  apps: ReadonlyArray<string>;
}): LauncherApp[] {
  const siblings = SIBLING_APPS.filter((app) => apps.includes(app));

  if (hasPortalAccess || superAdmin || siblings.length === 0) {
    return ["portal", ...siblings];
  }

  return siblings;
}
