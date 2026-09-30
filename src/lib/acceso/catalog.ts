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

// "Volver" and "Elegir aplicación" lead to the apex directory. With fewer than
// two apps there is nothing to choose there, so no app shows them.
export function directoryLinkFor({
  apps,
  apexUrl,
}: {
  apps: ReadonlyArray<LauncherApp>;
  apexUrl: string | null;
}): string | null {
  return apps.length >= 2 ? apexUrl : null;
}

// Subdomains are not always the app key: the ops hub lives at op.
export const APP_SUBDOMAINS: Record<LauncherApp, string> = {
  portal: "portal",
  analytics: "analytics",
  incidencias: "incidencias",
  generator: "generator",
  ops: "op",
  facturacion: "facturacion",
};

export function appSubdomain(app: string): string {
  return APP_SUBDOMAINS[app as LauncherApp] ?? app;
}

export const REQUEST_DEFAULT_APP = "portal";

// The app a Solicitud asks for comes from `/no-access?app=` and the form's
// hidden field, both user-editable: anything the auth_app catalog doesn't know
// falls back to the portal. Never an authorization input — every Solicitud
// still needs an approval.
export function resolveRequestApp(
  raw: string | null | undefined,
  knownApps: ReadonlyArray<string>,
): string {
  const app = raw?.trim().toLowerCase() ?? "";
  return app && knownApps.includes(app) ? app : REQUEST_DEFAULT_APP;
}

// Función feeds the portal's grilla and its notification routing; no other app
// asks for it.
export function requestAsksFuncion(app: string): boolean {
  return app === REQUEST_DEFAULT_APP;
}
