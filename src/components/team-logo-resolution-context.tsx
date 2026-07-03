"use client";

import { createContext, useContext, type ReactNode } from "react";

// A server-built lookup of resolved crest paths, keyed exactly like
// ClientTeamLogoMark's cacheKey (`${teamName}::${competition ?? ""}`). A server
// component resolves the map once (via resolveTeamLogoMap) for the teams it will
// render and hands it to this provider, so leaf ClientTeamLogoMark instances
// paint from the initial markup instead of each fetching /api/team-logo on mount.
type TeamLogoResolutionMap = Record<string, string | null>;

const TeamLogoResolutionContext = createContext<TeamLogoResolutionMap | null>(null);

export function TeamLogoResolutionProvider({
  value,
  children,
}: {
  value: TeamLogoResolutionMap;
  children: ReactNode;
}) {
  return (
    <TeamLogoResolutionContext.Provider value={value}>
      {children}
    </TeamLogoResolutionContext.Provider>
  );
}

// Returns whether the crest for a given cacheKey was pre-resolved on the server
// and, if so, its path (which may legitimately be null → render initials, no
// fetch). `resolved: false` means no provider covered this key → fetch fallback.
export function useResolvedTeamLogo(cacheKey: string): {
  resolved: boolean;
  src: string | null;
} {
  const map = useContext(TeamLogoResolutionContext);

  if (map && cacheKey in map) {
    return { resolved: true, src: map[cacheKey] ?? null };
  }

  return { resolved: false, src: null };
}
