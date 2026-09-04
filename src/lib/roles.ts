// Role catalog + capability table. The only module allowed to spell out which
// portal roles exist and what each may do; everything else asks `can(...)`.
// Dependency-free on purpose: the pure parse layer and client components import it.
import type { AppRole } from "@/lib/database.types";

export const APP_ROLES = [
  "admin",
  "editor",
  "collaborator",
] as const satisfies ReadonlyArray<AppRole>;

export const APP_ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  editor: "Productor",
  collaborator: "Externo",
};

// Ordered least -> most privileged, for tier selects.
export const ACCESS_TIER_OPTIONS: ReadonlyArray<{
  value: AppRole;
  label: string;
}> = [
  { value: "collaborator", label: APP_ROLE_LABELS.collaborator },
  { value: "editor", label: APP_ROLE_LABELS.editor },
  { value: "admin", label: APP_ROLE_LABELS.admin },
];

export type Capability =
  // Full content shell, generator gate, reports API.
  | "dashboard.full"
  // Any mutation of domain data (requireEditor).
  | "edit"
  // Grant / revoke platform access; tier-limited, see canGrantTier.
  | "access.manage"
  // Decide access requests. Coincides with dashboard.full today; kept as its
  // own row because it records a policy decision (D-06), not a coincidence.
  | "access.approve"
  // Settings, logs, roles catalog, tier select, delete-with-revoke.
  | "admin";

const CAPABILITY_ROLES = {
  "dashboard.full": ["admin", "editor"],
  edit: ["admin", "editor", "collaborator"],
  "access.manage": ["admin", "editor"],
  "access.approve": ["admin", "editor"],
  admin: ["admin"],
} as const satisfies Record<Capability, ReadonlyArray<AppRole>>;

export const CAPABILITY_DENIED_MESSAGE: Record<Capability, string> = {
  "dashboard.full": "No tenes permisos para acceder a esta seccion.",
  edit: "No tenes permisos para editar.",
  "access.manage": "No tenes permisos para gestionar accesos a la plataforma.",
  "access.approve": "No tenes permisos para aprobar solicitudes de acceso.",
  admin: "Solo un admin puede realizar esta accion.",
};

// The two axes a caller would otherwise have to remember to check together:
// an authenticated-but-unprovisioned context carries a role literal and
// hasAccess:false, and must never pass a capability check.
export type Actor = { role: AppRole; hasAccess: boolean };

export function can(
  actor: Actor | null | undefined,
  capability: Capability,
): boolean {
  if (!actor || !actor.hasAccess) {
    return false;
  }

  return (CAPABILITY_ROLES[capability] as ReadonlyArray<AppRole>).includes(
    actor.role,
  );
}

// Admins grant or revoke every tier; productores are limited to the Externo
// tier so they cannot mint admin/Productor logins or revoke a higher account.
export function canGrantTier(
  actor: Actor | null | undefined,
  tier: AppRole,
): boolean {
  if (!can(actor, "access.manage")) {
    return false;
  }

  if (actor?.role === "admin") {
    return true;
  }

  return tier === "collaborator";
}

export function isAppRole(value: string | null | undefined): value is AppRole {
  return (
    value != null && (APP_ROLES as ReadonlyArray<string>).includes(value)
  );
}

// Unknown or missing input falls back to the least-privileged tier (Externo).
export function normalizeAccessTier(value: string): AppRole {
  const normalized = value.trim().toLowerCase();

  return isAppRole(normalized) ? normalized : "collaborator";
}
