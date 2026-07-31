// Split out of `@/lib/team-logos` (which is `server-only` because it indexes
// `public/` with node:fs at import time) so the presentational crest fallback can
// also render from client components.

export function getTeamInitials(name?: string | null) {
  const source = (name ?? "EQ").trim();
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "EQ";
}
