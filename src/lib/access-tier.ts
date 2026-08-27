// Access-grant tiers map onto the profiles.role enum: Admin/Productor/Externo.
// Unknown or missing input falls back to the least-privileged tier (Externo).
// Dependency-free on purpose: the pure parse layer imports from here.
export const ACCESS_TIER_ROLES = ["admin", "editor", "collaborator"] as const;

export type AccessTierRole = (typeof ACCESS_TIER_ROLES)[number];

export function normalizeAccessTier(value: string): AccessTierRole {
  const normalized = value.trim().toLowerCase();

  return (ACCESS_TIER_ROLES as readonly string[]).includes(normalized)
    ? (normalized as AccessTierRole)
    : "collaborator";
}
