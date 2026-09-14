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
] as const satisfies ReadonlyArray<(typeof appAccessApp.enumValues)[number]>;

export const ACCESO_LEVELS = [
  "read",
  "write",
  "admin",
] as const satisfies ReadonlyArray<(typeof appAccessLevel.enumValues)[number]>;

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
};

export const ACCESO_LEVEL_LABELS: Record<AccesoLevel, string> = {
  read: "Lectura",
  write: "Escritura",
  admin: "Admin",
};

// What each Nivel unlocks per app (spec #172 "Level semantics"), shown under
// each matrix column so an admin grants the right one.
export const SIBLING_APP_LEVEL_HELP: Record<SiblingApp, string> = {
  analytics: "Cualquier nivel habilita todos los tableros.",
  incidencias:
    "Lectura: ver incidencias y reportes. Escritura: cargar, editar y borrar.",
  generator: "Cualquier nivel habilita la herramienta.",
  ops: "Lectura: solo el tablero. Escritura: clubes, mensajes, importaciones.",
};
