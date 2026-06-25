import { requireUserContext } from "@/lib/auth";
import type { AppRole } from "@/lib/database.types";

export async function requireAdmin() {
  const context = await requireUserContext();

  if (context.role !== "admin") {
    throw new Error("Solo un admin puede realizar esta accion.");
  }

  return context;
}

export async function requireAdminAccessManager() {
  const context = await requireUserContext();

  if (context.role !== "admin") {
    throw new Error("Solo un admin puede crear accesos a la plataforma.");
  }

  return context;
}

// Productores (editor/coordinator) may manage platform access in addition to
// admins, but only at the Externo (collaborator) tier — see canManageAccessTier.
export function isAccessManagerRole(role: AppRole): boolean {
  return role === "admin" || role === "editor" || role === "coordinator";
}

// Tiers a manager may grant or revoke: admins manage every tier; productores are
// limited to the Externo (collaborator) tier so they cannot mint admin/Productor
// logins or revoke a higher-privileged account.
export function canManageAccessTier(role: AppRole, tier: AppRole): boolean {
  if (role === "admin") {
    return true;
  }

  if (role === "editor" || role === "coordinator") {
    return tier === "collaborator";
  }

  return false;
}

export async function requireAccessManager() {
  const context = await requireUserContext();

  if (!isAccessManagerRole(context.role)) {
    throw new Error("No tenes permisos para gestionar accesos a la plataforma.");
  }

  return context;
}
