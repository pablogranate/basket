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

// Matrix select value meaning "revoke" — not a Nivel, so kept apart from them.
export const NONE_LEVEL_OPTION = "none";

export type SiblingApp = (typeof SIBLING_APPS)[number];
export type AccesoLevel = (typeof ACCESO_LEVELS)[number];
// What a matrix select can hold: a Nivel or "none" (revoke).
export type LevelOption = AccesoLevel | typeof NONE_LEVEL_OPTION;

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

// Also labels a Nivel the app no longer offers, so a stray row still renders.
export function accesoLevelLabel(app: SiblingApp, level: AccesoLevel): string {
  const offered = accesoLevelOptions(app).find((option) => option.level === level);
  return offered?.label ?? `${DEFAULT_LEVEL_LABELS[level]} (no aplica)`;
}

// What each Nivel unlocks per app (spec #172 "Level semantics"), shown under
// each matrix column so an admin grants the right one.
export const SIBLING_APP_LEVEL_HELP: Record<SiblingApp, string> = {
  analytics: "Cualquier nivel habilita todos los tableros.",
  incidencias:
    "Lectura: ver incidencias y reportes. Escritura: cargar, editar y borrar.",
  generator: "Cualquier nivel habilita la herramienta.",
  ops: "Lectura: solo el tablero. Escritura: clubes, mensajes, importaciones.",
  facturacion:
    "Coordinador: carga y gestiona a sus periodistas. Admin: ve y administra todas las facturas.",
};
