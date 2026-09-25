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
  // Grant / revoke platform access; rank-limited, see canGrantRole.
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
// hasAccess:false, and must never pass a capability check. superAdmin comes
// from auth_user.role (ADR 0010); a super admin's role is always admin.
export type Actor = { role: AppRole; hasAccess: boolean; superAdmin?: boolean };

// Which roles hold a capability — for the few places that enumerate people
// (seeds, reports) rather than check one actor.
export function rolesWithCapability(
  capability: Capability,
): ReadonlyArray<AppRole> {
  return CAPABILITY_ROLES[capability];
}

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

// Mirror of the portal rows in the Auth DB catalog (auth_app_role, app
// `portal`); an integration test asserts they match. Higher outranks lower.
export const PORTAL_ROLE_RANK: Record<AppRole, number> = {
  collaborator: 10,
  editor: 20,
  admin: 30,
};

// The portal's is_admin catalog role.
export const PORTAL_ADMIN_ROLE: AppRole = "admin";

// ADR 0010: a manager grants, re-tiers or revokes only roles ranked below
// their own; the app's admin role also reaches its own rank, and super admins
// grant anything. Productores reach Externo only.
export function canGrantRole(
  actor: Actor | null | undefined,
  role: AppRole,
): boolean {
  if (!actor || !can(actor, "access.manage")) {
    return false;
  }

  if (actor.superAdmin) {
    return true;
  }

  const actorRank = PORTAL_ROLE_RANK[actor.role];
  const targetRank = PORTAL_ROLE_RANK[role];

  return actor.role === PORTAL_ADMIN_ROLE
    ? actorRank >= targetRank
    : actorRank > targetRank;
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
