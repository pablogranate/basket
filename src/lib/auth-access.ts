import { requireUserContext } from "@/lib/auth";
import type { UserContext } from "@/lib/auth";
import { can, CAPABILITY_DENIED_MESSAGE, type Capability } from "@/lib/roles";

export async function requireCapability(
  capability: Capability,
): Promise<UserContext> {
  const context = await requireUserContext();

  if (!can(context, capability)) {
    throw new Error(CAPABILITY_DENIED_MESSAGE[capability]);
  }

  return context;
}

export const requireAdmin = () => requireCapability("admin");

// Productores may manage platform access in addition to admins, but only at
// the Externo (collaborator) tier — see canGrantTier in roles.ts.
export const requireAccessManager = () => requireCapability("access.manage");

export const requireAccessRequestApprover = () =>
  requireCapability("access.approve");
