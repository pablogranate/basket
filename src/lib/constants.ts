import type { AppRole, Database } from "@/lib/database.types";
import { BUSINESS_LABELS, PRODUCT_COPY, SECTION_COPY } from "@/lib/copy";

export const APP_NAME = PRODUCT_COPY.appName;
export const APP_PORTAL_LABEL = PRODUCT_COPY.portalLabel;
export const APP_RELEASE_LABEL = PRODUCT_COPY.releaseLabel;
export const PRODUCTION_SHORT_LABEL = BUSINESS_LABELS.productionShort;
export const RESPONSIBLE_DISPLAY_LABEL = BUSINESS_LABELS.responsible;
export const RELATOS_DISPLAY_LABEL = BUSINESS_LABELS.relatos;
export const DEFAULT_TIMEZONE =
  process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "America/Bogota";
export const DEFAULT_MATCH_DURATION_MINUTES = 150;
export const ADMIN_DEFAULT_DASHBOARD_HREF = "/grid";
export const COLLABORATOR_DEFAULT_DASHBOARD_HREF = "/mi-jornada";

export const MATCH_STATUS_OPTIONS: Database["public"]["Enums"]["match_status"][] =
  ["Pendiente", "Confirmado", "Realizado"];

export const PRODUCTION_MODE_OPTIONS = [
  "Encoder",
  "Offtube Remoto",
  "En Cancha",
  "Envio FDC/TYC",
  "Envio FDC/DTV",
] as const;

export const COMMENTARY_PLAN_OPTIONS = [
  "Relatos en Cancha",
  "Offtube Remoto",
] as const;

export type ProductionModeOption = (typeof PRODUCTION_MODE_OPTIONS)[number];

const PRODUCTION_MODE_ALIASES = new Map<string, ProductionModeOption>([
  ["cancha", "En Cancha"],
]);

export function normalizeProductionMode(
  value: string | null | undefined,
): ProductionModeOption | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  const exactOption = PRODUCTION_MODE_OPTIONS.find(
    (option) => option.toLowerCase() === normalized.toLowerCase(),
  );

  if (exactOption) {
    return exactOption;
  }

  return PRODUCTION_MODE_ALIASES.get(normalized.toLowerCase()) ?? null;
}

export function getProductionModeLabel(value: string | null | undefined) {
  const normalized = normalizeProductionMode(value);

  if (normalized) {
    return normalized;
  }

  return value?.trim() ?? "";
}

export function normalizeCommentaryPlan(
  value: string | null | undefined,
): (typeof COMMENTARY_PLAN_OPTIONS)[number] | "" {
  const normalized = value?.trim();

  if (!normalized) {
    return "";
  }

  return (
    COMMENTARY_PLAN_OPTIONS.find(
      (option) => option.toLowerCase() === normalized.toLowerCase(),
    ) ?? ""
  );
}

export const DASHBOARD_NAV = [
  { href: "/grid", label: SECTION_COPY.grid.title },
  { href: "/mi-jornada", label: SECTION_COPY.myDay.title },
  { href: "/incidents", label: "Incidencias" },
  { href: "/reports", label: "Reportes" },
  { href: "/teams", label: SECTION_COPY.teams.title },
  { href: "/people", label: SECTION_COPY.people.title },
  { href: "/roles", label: SECTION_COPY.roles.title },
  { href: "/settings", label: SECTION_COPY.settings.title },
] as const;

const COLLABORATOR_ALLOWED_DASHBOARD_PREFIXES = ["/mi-jornada"] as const;

const PRODUCTOR_DENIED_DASHBOARD_PREFIXES = [
  "/roles",
  "/settings",
  "/notifications",
] as const;

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function hasFullDashboardAccessRole(role?: AppRole | null) {
  return role === "admin" || role === "editor" || role === "coordinator";
}

export function isAdminDashboardRole(role?: AppRole | null) {
  return role === "admin";
}

export function isCollaboratorLimitedRole(role?: AppRole | null) {
  return !hasFullDashboardAccessRole(role);
}

export function isDashboardPathAllowedForRole(
  pathname: string,
  role?: AppRole | null,
) {
  if (isAdminDashboardRole(role)) {
    return true;
  }

  if (hasFullDashboardAccessRole(role)) {
    return !PRODUCTOR_DENIED_DASHBOARD_PREFIXES.some((prefix) =>
      matchesPrefix(pathname, prefix),
    );
  }

  return COLLABORATOR_ALLOWED_DASHBOARD_PREFIXES.some((prefix) =>
    matchesPrefix(pathname, prefix),
  );
}

export function isDashboardNavHrefAllowedForRole(
  href: string,
  role?: AppRole | null,
) {
  return isDashboardPathAllowedForRole(href, role);
}

export function getDefaultDashboardHrefForRole(role?: AppRole | null) {
  if (hasFullDashboardAccessRole(role)) {
    return ADMIN_DEFAULT_DASHBOARD_HREF;
  }

  return COLLABORATOR_DEFAULT_DASHBOARD_HREF;
}

export const RESERVED_IMPORT_HEADERS = new Set([
  "fecha",
  "dia",
  "día",
  "hora",
  "partido",
  "liga",
  "torneo",
  "competencia",
  "modo",
  "produccion",
  "producción",
  "estado",
  "responsable",
  "owner",
  "local",
  "visitante",
  "observaciones",
  "notas",
  "duracion",
  "duración",
  "timezone",
]);

export const ROLE_SEED = [
  { name: "Responsable", category: "Coordinacion", sortOrder: 10 },
  { name: "Realizador", category: "Produccion", sortOrder: 20 },
  { name: "Operador de Control", category: "Produccion", sortOrder: 30 },
  { name: "Operador de Grafica", category: "Produccion", sortOrder: 35 },
  { name: "Soporte tecnico", category: "Produccion", sortOrder: 40 },
  { name: "Productor", category: "Produccion", sortOrder: 50 },
  { name: "Relator", category: "Talento", sortOrder: 60 },
  { name: "Comentario 1", category: "Talento", sortOrder: 70 },
  { name: "Comentario 2", category: "Talento", sortOrder: 80 },
  { name: "Campo", category: "Talento", sortOrder: 90 },
  { name: "Encoder", category: "Transmision", sortOrder: 100 },
  { name: "Ingenieria", category: "Transmision", sortOrder: 110 },
  { name: "Camara 1", category: "Camaras", sortOrder: 120 },
  { name: "Camara 2", category: "Camaras", sortOrder: 130 },
  { name: "Camara 3", category: "Camaras", sortOrder: 140 },
  { name: "Camara 4", category: "Camaras", sortOrder: 150 },
  { name: "Camara 5", category: "Camaras", sortOrder: 160 },
] as const;

export const ROLE_CATEGORY_ORDER = [
  "Coordinacion",
  "Produccion",
  "Talento",
  "Transmision",
  "Camaras",
] as const;
